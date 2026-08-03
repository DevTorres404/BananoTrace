import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { EstadoConfirmacionBlockchain, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TransitionForChain,
  evaluarConfirmacion,
  hashPayload,
  registrarBloque,
  verificarBloques,
  verificarEncadenamiento,
} from './blockchain-chain';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);

  constructor(private readonly prisma: PrismaService) {}

  async crearBloque(
    tx: Prisma.TransactionClient,
    params: { idInstancia: bigint; transicion: TransitionForChain },
  ): Promise<void> {
    try {
      await registrarBloque(tx, params);
    } catch (error) {
      throw new ConflictException(
        `No se pudo registrar el bloque de blockchain para la transición ${params.transicion.idTransicion.toString()}: ${(error as Error).message}`,
      );
    }
  }

  async verificarCadena(idInstancia: bigint) {
    const bloques = await this.prisma.registroBlockchain.findMany({
      where: { idInstancia },
      orderBy: { indice: 'asc' },
      select: {
        indice: true,
        hashDatos: true,
        hashAnterior: true,
        payloadCanonico: true,
      },
    });
    const { integra, errores } = verificarBloques(bloques);
    return { integra, bloques: bloques.length, errores };
  }

  /**
   * Verificación "ligera" para contextos públicos (ficha de trazabilidad): lee solo las
   * columnas de vínculo (indice/hashDatos/hashAnterior) y el payload del último bloque,
   * en vez de cargar todos los payloads de la cadena. Detecta huecos, encadenamiento roto
   * y alteración del último bloque. La verificación forense completa queda en
   * `verificarCadena` para el panel administrativo.
   */
  async verificarCadenaLigera(idInstancia: bigint) {
    const bloques = await this.prisma.registroBlockchain.findMany({
      where: { idInstancia },
      orderBy: { indice: 'asc' },
      select: { indice: true, hashDatos: true, hashAnterior: true },
    });
    const { errores } = verificarEncadenamiento(bloques);

    const ultimo = await this.prisma.registroBlockchain.findFirst({
      where: { idInstancia },
      orderBy: { indice: 'desc' },
      select: { indice: true, hashDatos: true, payloadCanonico: true },
    });
    if (ultimo && hashPayload(ultimo.payloadCanonico) !== ultimo.hashDatos) {
      errores.push({
        indice: ultimo.indice,
        motivo:
          'El payload del último bloque no coincide con su hash (posible alteración)',
      });
    }

    return { integra: errores.length === 0, bloques: bloques.length, errores };
  }

  async listarCadena(idInstancia: bigint) {    const bloques = await this.prisma.registroBlockchain.findMany({
      where: { idInstancia },
      orderBy: { indice: 'asc' },
    });
    return bloques.map((bloque) => this.serialize(bloque));
  }

  async confirmarPendientes(limit = 50) {
    const pendientes = await this.prisma.registroBlockchain.findMany({
      where: { estadoConfirmacion: EstadoConfirmacionBlockchain.PENDIENTE },
      orderBy: { fechaRegistro: 'asc' },
      take: limit,
      select: {
        idRegistroBlockchain: true,
        idInstancia: true,
        indice: true,
        hashDatos: true,
        hashAnterior: true,
        payloadCanonico: true,
      },
    });

    let confirmados = 0;
    let errores = 0;
    for (const bloque of pendientes) {
      const anterior =
        bloque.indice === 0
          ? null
          : await this.prisma.registroBlockchain.findUnique({
              where: {
                idInstancia_indice: {
                  idInstancia: bloque.idInstancia,
                  indice: bloque.indice - 1,
                },
              },
              select: {
                indice: true,
                hashDatos: true,
                hashAnterior: true,
                payloadCanonico: true,
              },
            });

      const resultado = evaluarConfirmacion(bloque, anterior);
      await this.prisma.registroBlockchain.update({
        where: { idRegistroBlockchain: bloque.idRegistroBlockchain },
        data: { estadoConfirmacion: resultado.estado },
      });

      if (resultado.estado === 'CONFIRMADO') {
        confirmados++;
      } else {
        errores++;
        this.logger.warn(
          `Bloque ${bloque.idRegistroBlockchain.toString()} (instancia ${bloque.idInstancia.toString()}, índice ${bloque.indice}) marcado como ERROR: ${resultado.motivo}`,
        );
      }
    }

    return { confirmados, errores };
  }

  private serialize(bloque: {
    idRegistroBlockchain: bigint;
    idInstancia: bigint;
    idTransicion: bigint;
    indice: number;
    hashDatos: string;
    hashAnterior: string | null;
    algoritmo: string;
    fechaRegistro: Date;
    estadoConfirmacion: EstadoConfirmacionBlockchain;
  }) {
    return {
      idRegistroBlockchain: bloque.idRegistroBlockchain.toString(),
      idInstancia: bloque.idInstancia.toString(),
      idTransicion: bloque.idTransicion.toString(),
      indice: bloque.indice,
      hashDatos: bloque.hashDatos,
      hashAnterior: bloque.hashAnterior,
      algoritmo: bloque.algoritmo,
      fechaRegistro: bloque.fechaRegistro,
      estadoConfirmacion: bloque.estadoConfirmacion,
    };
  }

  async listarInstanciasRecientes(limit = 20) {
    const instancias = await this.prisma.flujoInstancia.findMany({
      where: {
        registrosBlockchain: {
          some: {},
        },
      },
      include: {
        flujo: {
          select: { nombre: true },
        },
      },
      orderBy: { fechaRegistro: 'desc' },
      take: limit,
    });
    return instancias.map((i) => ({
      idInstancia: i.idInstancia.toString(),
      codigo: i.codigo,
      estado: i.estado,
      flujo: i.flujo.nombre,
      fechaInicio: i.fechaInicio,
      fechaRegistro: i.fechaRegistro,
    }));
  }
}
