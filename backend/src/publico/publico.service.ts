import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RolUnidadFlujo } from '@prisma/client';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../prisma/prisma.service';

const unidadPublicaSelect = {
  tipo: true,
  codigo: true,
  lote: {
    select: {
      estado: true,
      fechaSiembra: true,
      fechaCosecha: true,
      finca: { select: { nombre: true, pais: true, region: true } },
    },
  },
  empaque: { select: { estado: true, fechaEmpaque: true } },
  envio: {
    select: { estado: true, fechaSalida: true, fechaEstimadaLlegada: true },
  },
  instancias: {
    where: { rol: RolUnidadFlujo.PRINCIPAL },
    orderBy: { instancia: { fechaRegistro: 'desc' as const } },
    take: 1,
    select: {
      idInstancia: true,
      instancia: {
        select: {
          ejecuciones: {
            orderBy: { fase: { orden: 'asc' as const } },
            select: {
              estado: true,
              fechaInicio: true,
              fechaFin: true,
              fase: { select: { nombre: true } },
            },
          },
        },
      },
    },
  },
};

@Injectable()
export class PublicoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchainService: BlockchainService,
  ) {}

  async consultarPorCodigo(codigoRaw: string) {
    const codigo = codigoRaw?.trim();
    if (!codigo) throw new BadRequestException('Debe indicar un código');

    const unidad = await this.prisma.unidadTrazable.findFirst({
      where: { codigo },
      select: unidadPublicaSelect,
    });
    if (!unidad) throw new NotFoundException('Código no encontrado');

    const estado =
      unidad.lote?.estado ?? unidad.empaque?.estado ?? unidad.envio?.estado ?? null;
    const instanceLink = unidad.instancias[0];
    const timeline = (instanceLink?.instancia.ejecuciones ?? []).map((ejecucion) => ({
      fase: ejecucion.fase.nombre,
      fecha: ejecucion.fechaInicio,
      estado: ejecucion.estado,
    }));

    return {
      tipo: unidad.tipo,
      codigo: unidad.codigo,
      estado,
      finca: unidad.lote?.finca ?? null,
      fechaSiembra: unidad.lote?.fechaSiembra ?? null,
      fechaCosecha: unidad.lote?.fechaCosecha ?? null,
      timeline,
      integridadBlockchain: instanceLink
        ? await this.resumenIntegridad(instanceLink.idInstancia)
        : { verificable: false, integra: null, bloques: 0 },
    };
  }

  async verificacionResumen(idInstanciaRaw: string) {
    return this.resumenIntegridad(this.parseId(idInstanciaRaw));
  }

  private async resumenIntegridad(idInstancia: bigint) {
    const { integra, bloques } = await this.blockchainService.verificarCadena(idInstancia);
    return { verificable: true, integra, bloques };
  }

  private parseId(raw: string): bigint {
    if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
      throw new BadRequestException('Identificador de instancia inválido');
    }
    return BigInt(raw);
  }
}
