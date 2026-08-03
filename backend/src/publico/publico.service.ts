import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RolUnidadFlujo } from '@prisma/client';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../prisma/prisma.service';

const envioPublicoSelect = {
  estado: true,
  fechaSalida: true,
  fechaEstimadaLlegada: true,
  temperaturaSalida: true,
  naviera: { select: { nombre: true } },
  puertoOrigen: { select: { nombre: true } },
  puertoDestino: { select: { nombre: true } },
};

const unidadPublicaSelect = {
  tipo: true,
  codigo: true,
  lote: {
    select: {
      estado: true,
      fechaSiembra: true,
      fechaCosecha: true,
      variedadCat: { select: { nombre: true, descripcion: true } },
      empaques: {
        orderBy: { fechaEmpaque: 'desc' as const },
        take: 1,
        select: {
          fechaEmpaque: true,
          pesoNetoKg: true,
          enviosEmpaque: {
            take: 1,
            select: { envio: { select: envioPublicoSelect } },
          },
        },
      },
      finca: {
        select: {
          nombre: true,
          pais: true,
          region: true,
          localidad: true,
          areaHectareas: true,
          productor: { select: { nombreRazonSocial: true, identificacion: true } },
          certificaciones: {
            where: {
              OR: [{ fechaVencimiento: null }, { fechaVencimiento: { gte: new Date() } }],
            },
            orderBy: { fechaVencimiento: 'desc' as const },
            take: 6,
            select: {
              numeroCertificado: true,
              fechaVencimiento: true,
              tipoCertificacion: { select: { nombre: true } },
              entidadCertificadora: { select: { nombre: true } },
            },
          },
        },
      },
    },
  },
  empaque: {
    select: {
      estado: true,
      fechaEmpaque: true,
      pesoNetoKg: true,
      enviosEmpaque: {
        take: 1,
        select: { envio: { select: envioPublicoSelect } },
      },
    },
  },
  envio: { select: envioPublicoSelect },
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
      // La unicidad es [tipo, codigo], así que un mismo código puede existir en varios
      // tipos (lote/caja/envío). Con este orden determinista (LOTE primero según la
      // definición del enum) la consulta pública prefiere siempre el lote, que es el caso
      // que generan los códigos QR.
      orderBy: { tipo: 'asc' as const },
      select: unidadPublicaSelect,
    });
    if (!unidad) throw new NotFoundException('Código no encontrado');

    const lote = unidad.lote ?? null;
    const empaque = unidad.empaque ?? null;
    const envioDirecto = unidad.envio ?? null;
    const empaqueResuelto = empaque ?? lote?.empaques?.[0] ?? null;
    const envio =
      envioDirecto ??
      empaque?.enviosEmpaque?.[0]?.envio ??
      lote?.empaques?.[0]?.enviosEmpaque?.[0]?.envio ??
      null;

    const estado = lote?.estado ?? empaque?.estado ?? envioDirecto?.estado ?? null;
    const instanceLink = unidad.instancias[0];
    const timeline = (instanceLink?.instancia.ejecuciones ?? []).map((ejecucion) => ({
      fase: ejecucion.fase.nombre,
      fecha: ejecucion.fechaInicio,
      estado: ejecucion.estado,
    }));

    const finca = lote?.finca ?? null;

    return {
      tipo: unidad.tipo,
      codigo: unidad.codigo,
      estado,
      finca: finca
        ? {
            nombre: finca.nombre,
            pais: finca.pais,
            region: finca.region,
            localidad: finca.localidad ?? null,
            areaHectareas:
              finca.areaHectareas != null ? String(finca.areaHectareas) : null,
          }
        : null,
      producto: {
        variedad: lote?.variedadCat?.nombre ?? null,
        descripcion: lote?.variedadCat?.descripcion ?? null,
      },
      productor: finca?.productor
        ? {
            nombreRazonSocial: finca.productor.nombreRazonSocial,
            identificacion: finca.productor.identificacion,
          }
        : null,
      pesoNetoKg:
        empaqueResuelto?.pesoNetoKg != null
          ? String(empaqueResuelto.pesoNetoKg)
          : null,
      fechaSiembra: lote?.fechaSiembra ?? null,
      fechaCosecha: lote?.fechaCosecha ?? null,
      fechas: {
        siembra: lote?.fechaSiembra ?? null,
        cosecha: lote?.fechaCosecha ?? null,
        empaque: empaqueResuelto?.fechaEmpaque ?? null,
        salida: envio?.fechaSalida ?? null,
        llegadaEstimada: envio?.fechaEstimadaLlegada ?? null,
      },
      certificaciones: (finca?.certificaciones ?? []).map((cert) => ({
        tipo: cert.tipoCertificacion?.nombre ?? null,
        entidad: cert.entidadCertificadora?.nombre ?? null,
        numero: cert.numeroCertificado,
        fechaVencimiento: cert.fechaVencimiento ?? null,
      })),
      envio: envio
        ? {
            temperaturaSalida:
              envio.temperaturaSalida != null ? String(envio.temperaturaSalida) : null,
            estado: envio.estado,
            naviera: envio.naviera?.nombre ?? null,
            puertoOrigen: envio.puertoOrigen?.nombre ?? null,
            puertoDestino: envio.puertoDestino?.nombre ?? null,
          }
        : null,
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
    const { integra, bloques } =
      await this.blockchainService.verificarCadenaLigera(idInstancia);
    return { verificable: true, integra, bloques };
  }

  private parseId(raw: string): bigint {
    if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
      throw new BadRequestException('Identificador de instancia inválido');
    }
    return BigInt(raw);
  }
}
