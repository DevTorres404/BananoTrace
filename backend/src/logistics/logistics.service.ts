import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoEmpaque,
  EstadoEnvio,
  EstadoFlujo,
  Prisma,
  RolUnidadFlujo,
  TipoUnidadTrazable,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AssignEmpaquesDto } from './dto/assign-empaques.dto';
import type { AdvanceLogisticsDto } from './dto/advance-logistics.dto';
import type { CreateEmpaqueDto } from './dto/create-empaque.dto';
import type { CreateEnvioDto } from './dto/create-envio.dto';

const empaqueInclude = {
  lote: { select: { codigoLote: true } },
  categoriaCalidadCat: {
    select: { idCategoriaCalidad: true, codigo: true, nombre: true },
  },
} satisfies Prisma.EmpaqueInclude;

const envioInclude = {
  naviera: true,
  puertoOrigen: true,
  puertoDestino: true,
} satisfies Prisma.EnvioInclude;

type EmpaqueWithCatalog = Prisma.EmpaqueGetPayload<{
  include: typeof empaqueInclude;
}>;
type EnvioWithCatalogs = Prisma.EnvioGetPayload<{
  include: typeof envioInclude;
}>;

@Injectable()
export class LogisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchainService: BlockchainService,
  ) {}

  async options(actor: AuthenticatedUser) {
    const lotWhere: Prisma.LoteProduccionWhereInput = {
      unidad: {
        instancias: {
          some: {
            rol: RolUnidadFlujo.PRINCIPAL,
            instancia: {
              ejecuciones: {
                some: {
                  estado: EstadoFlujo.EN_PROCESO,
                  fase: { codigo: 'EMPAQUE' },
                },
              },
            },
          },
        },
      },
      ...(actor.idRol === ROLE_IDS.SUPERVISOR_AGRICOLA
        ? actor.idProductor
          ? {
              finca: {
                idProductor: this.parseId(actor.idProductor, 'productor'),
              },
            }
          : { idLote: -1n }
        : {}),
    };
    const [categoriasCalidad, navieras, puertos, lotes] = await Promise.all([
      this.prisma.categoriaCalidad.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
        select: { idCategoriaCalidad: true, codigo: true, nombre: true },
      }),
      this.prisma.naviera.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
        select: { idNaviera: true, codigo: true, nombre: true },
      }),
      this.prisma.puerto.findMany({
        where: { activo: true },
        orderBy: [{ paisNombre: 'asc' }, { nombre: 'asc' }],
        select: {
          idPuerto: true,
          codigo: true,
          nombre: true,
          paisCodigo: true,
          paisNombre: true,
        },
      }),
      this.prisma.loteProduccion.findMany({
        where: lotWhere,
        orderBy: { codigoLote: 'asc' },
        select: {
          idLote: true,
          codigoLote: true,
          finca: { select: { nombre: true } },
        },
      }),
    ]);

    return {
      categoriasCalidad,
      navieras,
      puertos,
      lotes: lotes.map(({ idLote, ...lot }) => ({
        idLote: idLote.toString(),
        ...lot,
      })),
    };
  }

  async createEmpaque(dto: CreateEmpaqueDto, actor: AuthenticatedUser) {
    const idUsuario = this.parseId(actor.sub, 'usuario');
    const idLote = this.parseId(dto.idLote, 'lote');
    const pesoNetoKg = this.parsePositiveDecimal(dto.pesoNetoKg, 'peso neto');

    return this.prisma.$transaction(async (tx) => {
      const lote = await tx.loteProduccion.findUnique({
        where: { idLote },
        select: { idLote: true, idUnidad: true },
      });
      if (!lote) throw new NotFoundException('Lote no encontrado');

      const categoria = dto.categoria
        ? await tx.categoriaCalidad.findFirst({
            where: {
              codigo: dto.categoria.trim().toUpperCase(),
              activo: true,
            },
          })
        : null;
      if (dto.categoria && !categoria) {
        throw new BadRequestException('La categoría de calidad no es válida');
      }

      const asociacion = await tx.flujoInstanciaUnidad.findFirst({
        where: { idUnidad: lote.idUnidad, rol: RolUnidadFlujo.PRINCIPAL },
      });
      if (!asociacion) {
        throw new BadRequestException('El lote no tiene un flujo asociado');
      }

      const ejecucionActiva = await tx.faseEjecucion.findFirst({
        where: {
          idInstancia: asociacion.idInstancia,
          estado: EstadoFlujo.EN_PROCESO,
        },
        include: { fase: true },
      });
      if (!ejecucionActiva || ejecucionActiva.fase.codigo !== 'EMPAQUE') {
        throw new BadRequestException(
          'El lote debe estar en la fase de empaque para generar cajas',
        );
      }

      const flujo = await tx.flujo.findFirst({
        where: { codigo: 'EMPAQUE_FLUJO', activo: true },
        orderBy: { version: 'desc' },
        include: {
          fases: {
            where: { activo: true },
            orderBy: { orden: 'asc' },
            take: 1,
          },
        },
      });
      const primeraFase = flujo?.fases[0];
      if (!flujo || !primeraFase) {
        throw new BadRequestException(
          'No existe un flujo activo para empaques',
        );
      }

      const unidad = await tx.unidadTrazable.create({
        data: { tipo: TipoUnidadTrazable.EMPAQUE },
        select: { idUnidad: true, codigo: true },
      });
      const codigoCaja = unidad.codigo;

      const empaque = await tx.empaque.create({
        data: {
          idUnidad: unidad.idUnidad,
          idEjecucion: ejecucionActiva.idEjecucion,
          idLote,
          idCategoriaCalidad: categoria?.idCategoriaCalidad,
          codigoCaja,
          pesoNetoKg,
          codigoQr: `QR-${unidad.codigo}`,
          estado: EstadoEmpaque.DISPONIBLE,
        },
        include: empaqueInclude,
      });

      const instancia = await tx.flujoInstancia.create({
        data: {
          idFlujo: flujo.idFlujo,
          codigo: `FLW-${codigoCaja}`,
          estado: EstadoFlujo.EN_PROCESO,
          unidades: {
            create: {
              idUnidad: unidad.idUnidad,
              rol: RolUnidadFlujo.PRINCIPAL,
            },
          },
        },
        select: { idInstancia: true },
      });

      await tx.faseEjecucion.create({
        data: {
          idInstancia: instancia.idInstancia,
          idFase: primeraFase.idFase,
          idFlujo: flujo.idFlujo,
          idResponsable:
            primeraFase.idRolResponsable === actor.idRol ? idUsuario : null,
          estado: EstadoFlujo.EN_PROCESO,
        },
      });

      return this.serializeEmpaque(empaque);
    });
  }

  async findAllEmpaques(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(query.pageSize ?? '20', 10) || 20),
    );
    const where: Prisma.EmpaqueWhereInput = {};

    if (query.idLote) {
      const idLote = this.parseSafeId(query.idLote);
      if (idLote !== null) where.idLote = idLote;
    }
    if (
      query.estado &&
      Object.values(EstadoEmpaque).includes(query.estado as EstadoEmpaque)
    ) {
      where.estado = query.estado as EstadoEmpaque;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.empaque.findMany({
        where,
        orderBy: { fechaEmpaque: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: empaqueInclude,
      }),
      this.prisma.empaque.count({ where }),
    ]);

    return {
      data: data.map((empaque) => this.serializeEmpaque(empaque)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async createEnvio(dto: CreateEnvioDto, actor: AuthenticatedUser) {
    const idUsuario = this.parseId(actor.sub, 'usuario');
    const puertoOrigenCodigo = this.requiredCode(
      dto.puertoOrigen,
      'puerto de origen',
    );
    const puertoDestinoCodigo = this.requiredCode(
      dto.puertoDestino,
      'puerto de destino',
    );
    if (puertoOrigenCodigo === puertoDestinoCodigo) {
      throw new BadRequestException(
        'Los puertos de origen y destino deben ser diferentes',
      );
    }

    const temperaturaSalida =
      dto.temperaturaSalida === undefined || dto.temperaturaSalida === null
        ? undefined
        : this.parseDecimal(dto.temperaturaSalida, 'temperatura de salida');
    const fechaEstimadaLlegada = this.parseOptionalDate(
      dto.fechaEstimadaLlegada,
      'fecha estimada de llegada',
    );

    return this.prisma.$transaction(async (tx) => {
      const [puertoOrigen, puertoDestino, naviera] = await Promise.all([
        tx.puerto.findFirst({
          where: { codigo: puertoOrigenCodigo, activo: true },
        }),
        tx.puerto.findFirst({
          where: { codigo: puertoDestinoCodigo, activo: true },
        }),
        dto.naviera
          ? tx.naviera.findFirst({
              where: {
                codigo: dto.naviera.trim().toUpperCase(),
                activo: true,
              },
            })
          : Promise.resolve(null),
      ]);

      if (!puertoOrigen) {
        throw new BadRequestException('El puerto de origen no es válido');
      }
      if (!puertoDestino) {
        throw new BadRequestException('El puerto de destino no es válido');
      }
      if (dto.naviera && !naviera) {
        throw new BadRequestException('La naviera no es válida');
      }

      const flujo = await tx.flujo.findFirst({
        where: { codigo: 'ENVIO_FLUJO', activo: true },
        orderBy: { version: 'desc' },
        include: {
          fases: {
            where: { activo: true },
            orderBy: { orden: 'asc' },
            take: 1,
          },
        },
      });
      const primeraFase = flujo?.fases[0];
      if (!flujo || !primeraFase) {
        throw new BadRequestException('No existe un flujo activo para envíos');
      }

      const unidad = await tx.unidadTrazable.create({
        data: { tipo: TipoUnidadTrazable.ENVIO },
        select: { idUnidad: true, codigo: true },
      });
      const codigoEnvio = unidad.codigo;

      const instancia = await tx.flujoInstancia.create({
        data: {
          idFlujo: flujo.idFlujo,
          codigo: `FLW-${codigoEnvio}`,
          estado: EstadoFlujo.EN_PROCESO,
          unidades: {
            create: {
              idUnidad: unidad.idUnidad,
              rol: RolUnidadFlujo.PRINCIPAL,
            },
          },
        },
        select: { idInstancia: true },
      });

      const ejecucion = await tx.faseEjecucion.create({
        data: {
          idInstancia: instancia.idInstancia,
          idFase: primeraFase.idFase,
          idFlujo: flujo.idFlujo,
          idResponsable:
            primeraFase.idRolResponsable === actor.idRol ? idUsuario : null,
          estado: EstadoFlujo.EN_PROCESO,
        },
      });

      const envio = await tx.envio.create({
        data: {
          idUnidad: unidad.idUnidad,
          idEjecucion: ejecucion.idEjecucion,
          codigoEnvio,
          numeroContenedor: dto.numeroContenedor?.trim() || null,
          idNaviera: naviera?.idNaviera,
          idPuertoOrigen: puertoOrigen.idPuerto,
          idPuertoDestino: puertoDestino.idPuerto,
          fechaEstimadaLlegada,
          temperaturaSalida,
        },
        include: envioInclude,
      });

      return this.serializeEnvio(envio);
    });
  }

  async findAllEnvios(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(query.pageSize ?? '20', 10) || 20),
    );

    const where: Prisma.EnvioWhereInput = {};
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { codigoEnvio: { contains: search, mode: 'insensitive' } },
        { numeroContenedor: { contains: search, mode: 'insensitive' } },
        { naviera: { nombre: { contains: search, mode: 'insensitive' } } },
        { puertoOrigen: { nombre: { contains: search, mode: 'insensitive' } } },
        {
          puertoDestino: { nombre: { contains: search, mode: 'insensitive' } },
        },
        {
          puertoDestino: {
            paisNombre: { contains: search, mode: 'insensitive' },
          },
        },
      ];
    }
    if (
      query.estado &&
      Object.values(EstadoEnvio).includes(query.estado as EstadoEnvio)
    ) {
      where.estado = query.estado as EstadoEnvio;
    }

    const [data, total, totalEnvios, planned, loaded, inTransit, delivered] =
      await this.prisma.$transaction([
        this.prisma.envio.findMany({
          where,
          orderBy: { fechaSalida: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: envioInclude,
        }),
        this.prisma.envio.count({ where }),
        this.prisma.envio.count(),
        this.prisma.envio.count({ where: { estado: EstadoEnvio.PLANIFICADO } }),
        this.prisma.envio.count({ where: { estado: EstadoEnvio.CARGADO } }),
        this.prisma.envio.count({ where: { estado: EstadoEnvio.EN_TRANSITO } }),
        this.prisma.envio.count({ where: { estado: EstadoEnvio.ENTREGADO } }),
      ]);

    return {
      data: data.map((envio) => this.serializeEnvio(envio)),
      summary: {
        total: totalEnvios,
        planned,
        loaded,
        inTransit,
        delivered,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async getEnvioById(idRaw: string) {
    const idEnvio = this.parseId(idRaw, 'envío');
    const envio = await this.prisma.envio.findUnique({
      where: { idEnvio },
      include: {
        ...envioInclude,
        empaques: {
          include: {
            empaque: { include: empaqueInclude },
          },
        },
      },
    });

    if (!envio) throw new NotFoundException('Envío no encontrado');

    return {
      ...this.serializeEnvio(envio),
      empaques: envio.empaques.map(({ empaque }) =>
        this.serializeEmpaque(empaque),
      ),
    };
  }

  async advanceEmpaque(
    idRaw: string,
    dto: AdvanceLogisticsDto,
    actor: AuthenticatedUser,
  ) {
    const idEmpaque = this.parseId(idRaw, 'empaque');
    await this.prisma.$transaction(async (tx) => {
      const empaque = await tx.empaque.findUnique({
        where: { idEmpaque },
        select: { idUnidad: true },
      });
      if (!empaque) throw new NotFoundException('Empaque no encontrado');
      const transition = await this.advanceUnitFlow(
        tx,
        empaque.idUnidad,
        'EMPAQUE_FLUJO',
        dto.comentario,
        actor,
      );
      await tx.empaque.update({
        where: { idEmpaque },
        data: { estado: transition.nextCode as EstadoEmpaque },
      });
    });

    const empaque = await this.prisma.empaque.findUnique({
      where: { idEmpaque },
      include: empaqueInclude,
    });
    if (!empaque) throw new NotFoundException('Empaque no encontrado');
    return this.serializeEmpaque(empaque);
  }

  async advanceEnvio(
    idRaw: string,
    dto: AdvanceLogisticsDto,
    actor: AuthenticatedUser,
  ) {
    const idEnvio = this.parseId(idRaw, 'envío');
    await this.prisma.$transaction(async (tx) => {
      const envio = await tx.envio.findUnique({
        where: { idEnvio },
        include: { empaques: { include: { empaque: true } } },
      });
      if (!envio) throw new NotFoundException('Envío no encontrado');
      if (
        envio.estado === EstadoEnvio.PLANIFICADO &&
        envio.empaques.length === 0
      ) {
        throw new ConflictException(
          'Debe asignar al menos una caja antes de cargar el envío',
        );
      }

      const transition = await this.advanceUnitFlow(
        tx,
        envio.idUnidad,
        'ENVIO_FLUJO',
        dto.comentario,
        actor,
      );
      const nextState = transition.nextCode as EstadoEnvio;
      await tx.envio.update({
        where: { idEnvio },
        data: {
          estado: nextState,
          ...(nextState === EstadoEnvio.EN_TRANSITO && !envio.fechaSalida
            ? { fechaSalida: new Date() }
            : {}),
        },
      });

      if (
        nextState === EstadoEnvio.EN_TRANSITO ||
        nextState === EstadoEnvio.ENTREGADO
      ) {
        const packageState = nextState as unknown as EstadoEmpaque;
        for (const { empaque } of envio.empaques) {
          if (empaque.estado === packageState) continue;
          const packageTransition = await this.advanceUnitFlow(
            tx,
            empaque.idUnidad,
            'EMPAQUE_FLUJO',
            `Actualización desde el envío ${envio.codigoEnvio}`,
            actor,
          );
          if (packageTransition.nextCode !== packageState) {
            throw new ConflictException(
              `El flujo del empaque ${empaque.codigoCaja} no coincide con el estado del envío`,
            );
          }
          await tx.empaque.update({
            where: { idEmpaque: empaque.idEmpaque },
            data: { estado: packageState },
          });
        }
      }
    });

    return this.getEnvioById(idEnvio.toString());
  }

  async assignEmpaques(
    idEnvioRaw: string,
    dto: AssignEmpaquesDto,
    actor: AuthenticatedUser,
  ) {
    const idEnvio = this.parseId(idEnvioRaw, 'envío');
    if (!Array.isArray(dto.empaquesIds) || dto.empaquesIds.length === 0) {
      throw new BadRequestException('Debe seleccionar al menos un empaque');
    }
    const empaquesIds = dto.empaquesIds.map((id) =>
      this.parseId(id, 'empaque'),
    );

    return this.prisma.$transaction(async (tx) => {
      const envio = await tx.envio.findUnique({ where: { idEnvio } });
      if (!envio) throw new NotFoundException('Envío no encontrado');
      if (envio.estado !== EstadoEnvio.PLANIFICADO) {
        throw new ConflictException(
          'Solo se pueden asignar cajas a un envío planificado',
        );
      }

      const empaques = await tx.empaque.findMany({
        where: { idEmpaque: { in: empaquesIds } },
      });
      if (empaques.length !== new Set(empaquesIds.map(String)).size) {
        throw new BadRequestException('Algunos empaques no existen');
      }
      const noDisponible = empaques.find(
        ({ estado }) => estado !== EstadoEmpaque.DISPONIBLE,
      );
      if (noDisponible) {
        throw new BadRequestException(
          `El empaque ${noDisponible.codigoCaja} no está disponible`,
        );
      }

      for (const empaque of empaques) {
        const transition = await this.advanceUnitFlow(
          tx,
          empaque.idUnidad,
          'EMPAQUE_FLUJO',
          `Asignado al envío ${envio.codigoEnvio}`,
          actor,
        );
        if (transition.nextCode !== EstadoEmpaque.ASIGNADO) {
          throw new ConflictException(
            `El empaque ${empaque.codigoCaja} no puede pasar a asignado`,
          );
        }
      }

      await tx.envioEmpaque.createMany({
        data: empaquesIds.map((idEmpaque) => ({ idEnvio, idEmpaque })),
        skipDuplicates: true,
      });
      await tx.empaque.updateMany({
        where: { idEmpaque: { in: empaquesIds } },
        data: { estado: EstadoEmpaque.ASIGNADO },
      });

      return {
        message: `${empaquesIds.length} cajas asignadas al envío ${envio.codigoEnvio}`,
      };
    });
  }

  private async advanceUnitFlow(
    tx: Prisma.TransactionClient,
    idUnidad: bigint,
    flowCode: string,
    comment: string | undefined,
    actor: AuthenticatedUser,
  ) {
    const link = await tx.flujoInstanciaUnidad.findFirst({
      where: {
        idUnidad,
        rol: RolUnidadFlujo.PRINCIPAL,
        instancia: { flujo: { codigo: flowCode } },
      },
      orderBy: { instancia: { fechaRegistro: 'desc' } },
      include: {
        instancia: {
          include: {
            ejecuciones: {
              where: {
                estado: { in: [EstadoFlujo.EN_PROCESO, EstadoFlujo.PENDIENTE] },
              },
              orderBy: { fechaRegistro: 'desc' },
              take: 1,
              include: { fase: true },
            },
          },
        },
      },
    });
    if (!link)
      throw new ConflictException(
        'La unidad no tiene un flujo activo asociado',
      );
    if (link.instancia.estado === EstadoFlujo.COMPLETADO) {
      throw new ConflictException('El flujo de la unidad ya está completado');
    }
    const current = link.instancia.ejecuciones[0];
    if (!current)
      throw new ConflictException('El flujo no tiene una fase activa');
    if (
      actor.idRol !== ROLE_IDS.ADMINISTRADOR &&
      current.fase.idRolResponsable !== actor.idRol
    ) {
      throw new ForbiddenException(
        'Su rol no es responsable de la fase actual',
      );
    }

    const nextTransition = await tx.transicionFase.findFirst({
      where: { idFaseOrigen: current.idFase, activo: true },
      orderBy: { faseDestino: { orden: 'asc' } },
      include: { faseDestino: true },
    });
    if (!nextTransition) {
      throw new ConflictException(
        'La unidad ya se encuentra en su estado final',
      );
    }

    const now = new Date();
    const idUsuario = this.parseId(actor.sub, 'usuario');
    await tx.faseEjecucion.update({
      where: { idEjecucion: current.idEjecucion },
      data: { estado: EstadoFlujo.COMPLETADO, fechaFin: now },
    });
    const transicionActual = await tx.transicionEjecucion.create({
      data: {
        idEjecucion: current.idEjecucion,
        idUsuario,
        estadoAnterior: current.estado,
        estadoNuevo: EstadoFlujo.COMPLETADO,
        comentario: comment?.trim() || null,
      },
    });
    await this.blockchainService.crearBloque(tx, {
      idInstancia: link.idInstancia,
      transicion: transicionActual,
    });

    const next = nextTransition.faseDestino;
    const isTerminal =
      (await tx.transicionFase.count({
        where: { idFaseOrigen: next.idFase, activo: true },
      })) === 0;
    const nextStatus = isTerminal
      ? EstadoFlujo.COMPLETADO
      : EstadoFlujo.EN_PROCESO;
    const nextExecution = await tx.faseEjecucion.create({
      data: {
        idInstancia: link.idInstancia,
        idFase: next.idFase,
        idFlujo: link.instancia.idFlujo,
        idResponsable:
          actor.idRol === ROLE_IDS.ADMINISTRADOR ||
          next.idRolResponsable === actor.idRol
            ? idUsuario
            : null,
        estado: nextStatus,
        fechaInicio: now,
        fechaFin: isTerminal ? now : null,
      },
    });
    const transicionSiguiente = await tx.transicionEjecucion.create({
      data: {
        idEjecucion: nextExecution.idEjecucion,
        idUsuario,
        estadoAnterior: null,
        estadoNuevo: nextStatus,
        comentario: `Transición desde ${current.fase.nombre}`,
      },
    });
    await this.blockchainService.crearBloque(tx, {
      idInstancia: link.idInstancia,
      transicion: transicionSiguiente,
    });
    if (isTerminal) {
      await tx.flujoInstancia.update({
        where: { idInstancia: link.idInstancia },
        data: { estado: EstadoFlujo.COMPLETADO, fechaFin: now },
      });
    }
    return {
      previousCode: current.fase.codigo,
      nextCode: next.codigo,
      isTerminal,
    };
  }

  private serializeEmpaque(empaque: EmpaqueWithCatalog) {
    const { categoriaCalidadCat, ...data } = empaque;
    return {
      ...data,
      idEmpaque: empaque.idEmpaque.toString(),
      idUnidad: empaque.idUnidad.toString(),
      idEjecucion: empaque.idEjecucion.toString(),
      idLote: empaque.idLote.toString(),
      pesoNetoKg: Number(empaque.pesoNetoKg),
      categoria: categoriaCalidadCat?.nombre ?? null,
      categoriaCodigo: categoriaCalidadCat?.codigo ?? null,
    };
  }

  private serializeEnvio(envio: EnvioWithCatalogs) {
    const { naviera, puertoOrigen, puertoDestino, ...data } = envio;
    return {
      ...data,
      idEnvio: envio.idEnvio.toString(),
      idUnidad: envio.idUnidad.toString(),
      idEjecucion: envio.idEjecucion.toString(),
      temperaturaSalida:
        envio.temperaturaSalida === null
          ? null
          : Number(envio.temperaturaSalida),
      naviera: naviera?.nombre ?? null,
      navieraCodigo: naviera?.codigo ?? null,
      puertoOrigen: puertoOrigen.nombre,
      puertoOrigenCodigo: puertoOrigen.codigo,
      puertoDestino: puertoDestino.nombre,
      puertoDestinoCodigo: puertoDestino.codigo,
      paisDestino: puertoDestino.paisNombre ?? null,
      paisDestinoCodigo: puertoDestino.paisCodigo ?? null,
    };
  }

  private parseId(raw: string, label: string): bigint {
    try {
      const id = BigInt(raw);
      if (id > 0n) return id;
    } catch {
      // El mensaje uniforme se genera después del intento.
    }
    throw new BadRequestException(`ID de ${label} no válido`);
  }

  private parseSafeId(raw: string): bigint | null {
    try {
      const id = BigInt(raw);
      return id > 0n ? id : null;
    } catch {
      return null;
    }
  }

  private requiredCode(raw: string, label: string) {
    const code = raw?.trim().toUpperCase();
    if (!code) throw new BadRequestException(`Debe seleccionar ${label}`);
    return code;
  }

  private parsePositiveDecimal(raw: number | string, label: string) {
    const value = this.parseDecimal(raw, label);
    if (Number(value) <= 0) {
      throw new BadRequestException(`El ${label} debe ser mayor que cero`);
    }
    return value;
  }

  private parseDecimal(raw: number | string, label: string) {
    const value = String(raw).trim();
    if (!value || !Number.isFinite(Number(value))) {
      throw new BadRequestException(`El valor de ${label} no es válido`);
    }
    return value;
  }

  private parseOptionalDate(raw: string | undefined, label: string) {
    if (!raw) return undefined;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`La ${label} no es válida`);
    }
    return date;
  }
}
