import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoFlujo,
  EstadoLote,
  Prisma,
  ResultadoControl,
  RolUnidadFlujo,
  TipoUnidadTrazable,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AdvanceLotDto } from './dto/advance-lot.dto';
import type { CreateLotDto } from './dto/create-lot.dto';
import type { UpdateLotDto } from './dto/update-lot.dto';

const FLOW_CODE = 'TRAZABILIDAD_BANANO_EXPORT';

const lotSelect = {
  idLote: true,
  idUnidad: true,
  idFinca: true,
  codigoLote: true,
  idVariedad: true,
  variedadCat: { select: { codigo: true, nombre: true } },
  fechaSiembra: true,
  fechaEstimadaCosecha: true,
  fechaCosecha: true,
  cantidadPlantas: true,
  pesoCosechadoKg: true,
  estado: true,
  fechaRegistro: true,
  fechaActualizacion: true,
  finca: {
    select: {
      idFinca: true,
      codigoFinca: true,
      nombre: true,
      pais: true,
      region: true,
      localidad: true,
      productor: {
        select: { idProductor: true, nombreRazonSocial: true },
      },
    },
  },
} satisfies Prisma.LoteProduccionSelect;

type LotRow = Prisma.LoteProduccionGetPayload<{ select: typeof lotSelect }>;
type LotActor = Pick<AuthenticatedUser, 'sub' | 'idRol' | 'idProductor'>;

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchainService: BlockchainService,
  ) {}

  async create(dto: CreateLotDto, actor: LotActor) {
    const idFinca = this.parseId(String(dto.idFinca ?? ''), 'finca');
    const idUsuario = this.parseId(actor.sub, 'usuario');
    const variedadCodigo = dto.variedad?.trim();
    const fechaSiembra = this.parseOptionalDate(
      dto.fechaSiembra,
      'fecha de siembra',
    );
    const fechaEstimadaCosecha = this.parseOptionalDate(
      dto.fechaEstimadaCosecha,
      'fecha estimada de cosecha',
    );
    if (
      fechaSiembra &&
      fechaEstimadaCosecha &&
      fechaEstimadaCosecha < fechaSiembra
    ) {
      throw new BadRequestException(
        'La fecha estimada de cosecha no puede ser anterior a la siembra',
      );
    }
    const cantidadPlantas = this.parsePositiveInteger(
      dto.cantidadPlantas,
      'cantidad de plantas',
    );

    const idLote = await this.prisma.$transaction(async (tx) => {
      const finca = await tx.finca.findFirst({
        where: { AND: [{ idFinca, estado: true }, this.buildFarmScope(actor)] },
        select: { idFinca: true },
      });
      if (!finca) throw new NotFoundException('Finca activa no encontrada');

      let idVariedad: number | null = null;
      if (variedadCodigo) {
        idVariedad = await this.resolveVariedadId(tx, variedadCodigo);
      }

      const flow = await tx.flujo.findFirst({
        where: { codigo: FLOW_CODE, activo: true },
        orderBy: { version: 'desc' },
        include: {
          fases: {
            where: { activo: true },
            orderBy: { orden: 'asc' },
            take: 1,
          },
        },
      });
      const firstPhase = flow?.fases[0];
      if (!flow || !firstPhase) {
        throw new ConflictException(
          'No existe un flujo activo con fases configuradas',
        );
      }

      const unit = await tx.unidadTrazable.create({
        data: { tipo: TipoUnidadTrazable.LOTE },
        select: { idUnidad: true, codigo: true },
      });
      const lot = await tx.loteProduccion.create({
        data: {
          idUnidad: unit.idUnidad,
          idFinca,
          idVariedad,
          fechaSiembra,
          fechaEstimadaCosecha,
          cantidadPlantas,
          estado: firstPhase.estadoLoteInicio ?? EstadoLote.PLANIFICADO,
        },
        select: { idLote: true, codigoLote: true },
      });
      if (unit.codigo !== lot.codigoLote) {
        throw new ConflictException(
          'La unidad trazable y el lote recibieron códigos distintos',
        );
      }

      const instance = await tx.flujoInstancia.create({
        data: {
          idFlujo: flow.idFlujo,
          codigo: `FLW-${lot.codigoLote}`,
          estado: EstadoFlujo.EN_PROCESO,
          fechaInicio: new Date(),
          unidades: {
            create: { idUnidad: unit.idUnidad, rol: RolUnidadFlujo.PRINCIPAL },
          },
        },
        select: { idInstancia: true },
      });
      const execution = await tx.faseEjecucion.create({
        data: {
          idInstancia: instance.idInstancia,
          idFase: firstPhase.idFase,
          idFlujo: flow.idFlujo,
          idResponsable:
            firstPhase.idRolResponsable === actor.idRol ? idUsuario : null,
          estado: EstadoFlujo.EN_PROCESO,
          fechaInicio: new Date(),
          datosAdicionales: { origen: 'CREACION_LOTE' },
        },
        select: { idEjecucion: true },
      });
      const transicion = await tx.transicionEjecucion.create({
        data: {
          idEjecucion: execution.idEjecucion,
          idUsuario,
          estadoAnterior: null,
          estadoNuevo: EstadoFlujo.EN_PROCESO,
          comentario: 'Inicio automático del flujo al crear el lote',
        },
      });
      await this.blockchainService.crearBloque(tx, {
        idInstancia: instance.idInstancia,
        transicion,
      });

      if (fechaSiembra) {
        const eventType = await tx.tipoEvento.findUnique({
          where: { nombre: 'SIEMBRA' },
          select: { idTipoEvento: true },
        });
        if (eventType) {
          await tx.eventoTrazabilidad.create({
            data: {
              idUnidad: unit.idUnidad,
              idEjecucion: execution.idEjecucion,
              idTipoEvento: eventType.idTipoEvento,
              idUsuario,
              fechaEvento: fechaSiembra,
              descripcion: 'Registro inicial de siembra del lote',
            },
          });
        }
      }
      return lot.idLote;
    });

    return this.findOne(idLote.toString(), actor);
  }

  async findAll(query: Record<string, string | undefined>, actor: LotActor) {
    const page = this.parsePage(query.page, 1);
    const pageSize = this.parsePage(query.pageSize, 10, 100);
    const where = this.buildFilters(query, actor);
    const summaryScope = this.buildScope(actor);
    const [data, total, totalLots, activeLots, plants] =
      await Promise.all([
        this.prisma.loteProduccion.findMany({
          where,
          select: lotSelect,
          orderBy: [{ fechaRegistro: 'desc' }, { idLote: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.loteProduccion.count({ where }),
        this.prisma.loteProduccion.count({ where: summaryScope }),
        this.prisma.loteProduccion.count({
          where: {
            AND: [summaryScope, { estado: { not: EstadoLote.CERRADO } }],
          },
        }),
        this.prisma.loteProduccion.aggregate({
          where: summaryScope,
          _sum: { cantidadPlantas: true },
        }),
      ]);
    return {
      data: data.map((lot) => this.serializeLot(lot)),
      summary: {
        totalLots,
        activeLots,
        totalPlants: plants._sum.cantidadPlantas ?? 0,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async options(actor: LotActor) {
    const [farms, varieties] = await Promise.all([
      this.prisma.finca.findMany({
        where: { AND: [this.buildFarmScope(actor), { estado: true }] },
        select: { idFinca: true, codigoFinca: true, nombre: true },
        orderBy: { nombre: 'asc' },
        take: 200,
      }),
      this.prisma.variedad.findMany({
        where: { activo: true },
        select: { idVariedad: true, codigo: true, nombre: true },
        orderBy: { nombre: 'asc' },
        take: 100,
      }),
    ]);
    return {
      states: Object.values(EstadoLote),
      farms: farms.map((farm) => ({
        ...farm,
        idFinca: farm.idFinca.toString(),
      })),
      varieties,
    };
  }

  async findOne(id: string, actor: LotActor) {
    const idLote = this.parseId(id, 'lote');
    const lot = await this.prisma.loteProduccion.findFirst({
      where: { AND: [{ idLote }, this.buildScope(actor)] },
      select: {
        ...lotSelect,
        unidad: {
          select: {
            eventos: {
              orderBy: { fechaEvento: 'asc' },
              select: {
                idEvento: true,
                fechaEvento: true,
                ubicacion: true,
                descripcion: true,
                datosAdicionales: true,
                tipoEvento: { select: { nombre: true } },
                usuario: { select: { nombres: true, apellidos: true } },
              },
            },
            instancias: {
              where: { rol: RolUnidadFlujo.PRINCIPAL },
              orderBy: { instancia: { fechaRegistro: 'desc' } },
              take: 1,
              select: {
                instancia: {
                  select: {
                    idInstancia: true,
                    codigo: true,
                    estado: true,
                    fechaInicio: true,
                    fechaFin: true,
                    flujo: {
                      select: { codigo: true, nombre: true, version: true },
                    },
                    ejecuciones: {
                      orderBy: [
                        { fase: { orden: 'asc' } },
                        { numeroIntento: 'asc' },
                      ],
                      select: {
                        idEjecucion: true,
                        estado: true,
                        numeroIntento: true,
                        fechaInicio: true,
                        fechaFin: true,
                        fase: {
                          select: {
                            codigo: true,
                            nombre: true,
                            orden: true,
                            requiereAprobacion: true,
                            idRolResponsable: true,
                          },
                        },
                        responsable: {
                          select: { nombres: true, apellidos: true },
                        },
                        transiciones: {
                          orderBy: { fechaTransicion: 'asc' },
                          select: {
                            idTransicion: true,
                            estadoAnterior: true,
                            estadoNuevo: true,
                            comentario: true,
                            fechaTransicion: true,
                            usuario: {
                              select: { nombres: true, apellidos: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');

    const { unidad, ...lotData } = lot;
    const instance = unidad.instancias[0]?.instancia ?? null;
    const currentExecution = instance?.ejecuciones.find(
      (execution) =>
        execution.estado === EstadoFlujo.EN_PROCESO ||
        execution.estado === EstadoFlujo.PENDIENTE,
    );
    return {
      ...this.serializeLot(lotData),
      timeline: unidad.eventos.map((event) => ({
        idEvento: event.idEvento.toString(),
        fecha: event.fechaEvento,
        tipo: event.tipoEvento.nombre,
        descripcion: event.descripcion,
        ubicacion: event.ubicacion,
        datos: event.datosAdicionales,
        usuario: `${event.usuario.nombres} ${event.usuario.apellidos}`.trim(),
      })),
      flujo: instance
        ? {
            idInstancia: instance.idInstancia.toString(),
            codigo: instance.codigo,
            estado: instance.estado,
            fechaInicio: instance.fechaInicio,
            fechaFin: instance.fechaFin,
            definicion: instance.flujo,
            faseActual: currentExecution
              ? {
                  idEjecucion: currentExecution.idEjecucion.toString(),
                  codigo: currentExecution.fase.codigo,
                  nombre: currentExecution.fase.nombre,
                  estado: currentExecution.estado,
                  requiereAprobacion: currentExecution.fase.requiereAprobacion,
                  idRolResponsable: currentExecution.fase.idRolResponsable,
                }
              : null,
            fases: instance.ejecuciones.map((execution) => ({
              idEjecucion: execution.idEjecucion.toString(),
              fase: execution.fase,
              estado: execution.estado,
              numeroIntento: execution.numeroIntento,
              fechaInicio: execution.fechaInicio,
              fechaFin: execution.fechaFin,
              responsable: execution.responsable
                ? `${execution.responsable.nombres} ${execution.responsable.apellidos}`.trim()
                : null,
              transiciones: execution.transiciones.map((transition) => ({
                ...transition,
                idTransicion: transition.idTransicion.toString(),
                usuario:
                  `${transition.usuario.nombres} ${transition.usuario.apellidos}`.trim(),
              })),
            })),
          }
        : null,
    };
  }

  async update(id: string, dto: UpdateLotDto, actor: LotActor) {
    const idLote = this.parseId(id, 'lote');
    const current = await this.findAccessibleLot(idLote, actor);
    const data: Prisma.LoteProduccionUncheckedUpdateInput = {};
    if (dto.variedad !== undefined) {
      data.idVariedad = await this.resolveVariedadId(this.prisma, dto.variedad);
    }
    if (dto.fechaSiembra !== undefined) {
      data.fechaSiembra = this.parseOptionalDate(
        dto.fechaSiembra,
        'fecha de siembra',
      );
    }
    if (dto.fechaEstimadaCosecha !== undefined) {
      data.fechaEstimadaCosecha = this.parseOptionalDate(
        dto.fechaEstimadaCosecha,
        'fecha estimada de cosecha',
      );
    }
    if (dto.fechaCosecha !== undefined) {
      data.fechaCosecha = this.parseOptionalDate(
        dto.fechaCosecha,
        'fecha de cosecha',
      );
    }
    if (dto.cantidadPlantas !== undefined) {
      data.cantidadPlantas = this.parsePositiveInteger(
        dto.cantidadPlantas,
        'cantidad de plantas',
      );
    }
    if (dto.pesoCosechadoKg !== undefined) {
      data.pesoCosechadoKg = this.parsePositiveDecimal(
        dto.pesoCosechadoKg,
        'peso cosechado',
      );
    }
    if (dto.estado !== undefined) {
      if (!Object.values(EstadoLote).includes(dto.estado)) {
        throw new BadRequestException('Estado de lote inválido');
      }
      data.estado = dto.estado;
    }

    const sowing =
      (data.fechaSiembra as Date | null | undefined) ?? current.fechaSiembra;
    const harvest =
      (data.fechaCosecha as Date | null | undefined) ?? current.fechaCosecha;
    const estimated =
      (data.fechaEstimadaCosecha as Date | null | undefined) ??
      current.fechaEstimadaCosecha;
    if (sowing && harvest && harvest < sowing) {
      throw new BadRequestException(
        'La fecha de cosecha no puede ser anterior a la siembra',
      );
    }
    if (sowing && estimated && estimated < sowing) {
      throw new BadRequestException(
        'La fecha estimada de cosecha no puede ser anterior a la siembra',
      );
    }

    await this.prisma.loteProduccion.update({ where: { idLote }, data });
    return this.findOne(id, actor);
  }

  async advance(id: string, dto: AdvanceLotDto, actor: LotActor) {
    const idLote = this.parseId(id, 'lote');
    const lot = await this.findAccessibleLot(idLote, actor);
    const idUsuario = this.parseId(actor.sub, 'usuario');
    const instanceLink = await this.prisma.flujoInstanciaUnidad.findFirst({
      where: { idUnidad: lot.idUnidad, rol: RolUnidadFlujo.PRINCIPAL },
      orderBy: { instancia: { fechaRegistro: 'desc' } },
      select: {
        idInstancia: true,
        instancia: { select: { idFlujo: true, estado: true } },
      },
    });
    if (!instanceLink)
      throw new ConflictException('El lote no tiene una instancia de flujo');
    if (instanceLink.instancia.estado === EstadoFlujo.COMPLETADO) {
      throw new ConflictException('El flujo del lote ya está completado');
    }

    const current = await this.prisma.faseEjecucion.findFirst({
      where: {
        idInstancia: instanceLink.idInstancia,
        estado: { in: [EstadoFlujo.EN_PROCESO, EstadoFlujo.PENDIENTE] },
      },
      orderBy: { fechaRegistro: 'desc' },
      include: { fase: true },
    });
    if (!current)
      throw new ConflictException('El flujo no tiene una fase activa');
    if (
      actor.idRol !== ROLE_IDS.ADMINISTRADOR &&
      current.fase.idRolResponsable !== actor.idRol
    ) {
      throw new ForbiddenException(
        'Tu rol no es responsable de la fase actual',
      );
    }
    const comment = dto.comentario?.trim() || null;
    if (current.fase.requiereAprobacion && !comment) {
      throw new BadRequestException(
        'La fase actual requiere un comentario de aprobación',
      );
    }

    const transitions = await this.prisma.transicionFase.findMany({
      where: { idFaseOrigen: current.idFase, activo: true },
      include: { faseDestino: true },
    });
    const next = transitions.sort(
      (a, b) => a.faseDestino.orden - b.faseDestino.orden,
    )[0]?.faseDestino;

    if (current.fase.codigo === 'CALIDAD' && next?.codigo === 'EMPAQUE') {
      const lastControl = await this.prisma.controlCalidad.findFirst({
        where: { idLote },
        orderBy: { fechaControl: 'desc' },
        select: { resultado: true },
      });
      if (lastControl?.resultado === ResultadoControl.RECHAZADO) {
        throw new ConflictException(
          'El último control de calidad fue rechazado. Registre una nueva inspección aprobada antes de avanzar a empaque',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const finishedAt = new Date();
      await tx.faseEjecucion.update({
        where: { idEjecucion: current.idEjecucion },
        data: { estado: EstadoFlujo.COMPLETADO, fechaFin: finishedAt },
      });
      const transicionActual = await tx.transicionEjecucion.create({
        data: {
          idEjecucion: current.idEjecucion,
          idUsuario,
          estadoAnterior: current.estado,
          estadoNuevo: EstadoFlujo.COMPLETADO,
          comentario: comment,
        },
      });
      await this.blockchainService.crearBloque(tx, {
        idInstancia: instanceLink.idInstancia,
        transicion: transicionActual,
      });

      if (next) {
        const nextExecution = await tx.faseEjecucion.create({
          data: {
            idInstancia: instanceLink.idInstancia,
            idFase: next.idFase,
            idFlujo: instanceLink.instancia.idFlujo,
            idResponsable:
              next.idRolResponsable === actor.idRol ? idUsuario : null,
            estado: EstadoFlujo.EN_PROCESO,
            fechaInicio: finishedAt,
          },
          select: { idEjecucion: true },
        });
        const transicionSiguiente = await tx.transicionEjecucion.create({
          data: {
            idEjecucion: nextExecution.idEjecucion,
            idUsuario,
            estadoAnterior: null,
            estadoNuevo: EstadoFlujo.EN_PROCESO,
            comentario: `Inicio desde la fase ${current.fase.nombre}`,
          },
        });
        await this.blockchainService.crearBloque(tx, {
          idInstancia: instanceLink.idInstancia,
          transicion: transicionSiguiente,
        });
        if (next.estadoLoteInicio) {
          await tx.loteProduccion.update({
            where: { idLote },
            data: { estado: next.estadoLoteInicio },
          });
        }
      } else {
        await tx.flujoInstancia.update({
          where: { idInstancia: instanceLink.idInstancia },
          data: { estado: EstadoFlujo.COMPLETADO, fechaFin: finishedAt },
        });
        if (current.fase.estadoLoteFin) {
          await tx.loteProduccion.update({
            where: { idLote },
            data: { estado: current.fase.estadoLoteFin },
          });
        }
      }
    });
    return this.findOne(id, actor);
  }

  private buildFilters(
    query: Record<string, string | undefined>,
    actor: LotActor,
  ): Prisma.LoteProduccionWhereInput {
    const filters: Prisma.LoteProduccionWhereInput[] = [this.buildScope(actor)];
    if (query.q) {
      const q = query.q.trim();
      filters.push({
        OR: [
          { codigoLote: { contains: q, mode: 'insensitive' } },
          { finca: { nombre: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    if (query.idFinca)
      filters.push({ idFinca: this.parseId(query.idFinca, 'finca') });
    if (query.estado) {
      if (!Object.values(EstadoLote).includes(query.estado as EstadoLote)) {
        throw new BadRequestException('Estado de lote inválido');
      }
      filters.push({ estado: query.estado as EstadoLote });
    }
    if (query.desde || query.hasta) {
      filters.push({
        fechaSiembra: {
          ...(query.desde
            ? { gte: this.parseDate(query.desde, 'fecha desde') }
            : {}),
          ...(query.hasta
            ? { lte: this.parseDate(query.hasta, 'fecha hasta') }
            : {}),
        },
      });
    }
    return { AND: filters };
  }

  private buildScope(actor: LotActor): Prisma.LoteProduccionWhereInput {
    if (
      actor.idRol === ROLE_IDS.SUPERVISOR_AGRICOLA ||
      actor.idRol === ROLE_IDS.GERENTE_PRODUCTOR
    ) {
      return actor.idProductor
        ? {
            finca: {
              idProductor: this.parseId(actor.idProductor, 'productor'),
            },
          }
        : { idLote: -1n };
    }
    if (
      (
        [
          ROLE_IDS.ADMINISTRADOR,
          ROLE_IDS.CALIDAD,
          ROLE_IDS.LOGISTICA,
        ] as number[]
      ).includes(actor.idRol)
    ) {
      return {};
    }
    throw new ForbiddenException('No tiene acceso a lotes');
  }

  private buildFarmScope(actor: LotActor): Prisma.FincaWhereInput {
    if (
      actor.idRol === ROLE_IDS.SUPERVISOR_AGRICOLA ||
      actor.idRol === ROLE_IDS.GERENTE_PRODUCTOR
    ) {
      return actor.idProductor
        ? { idProductor: this.parseId(actor.idProductor, 'productor') }
        : { idFinca: -1n };
    }
    if (
      (
        [
          ROLE_IDS.ADMINISTRADOR,
          ROLE_IDS.CALIDAD,
          ROLE_IDS.LOGISTICA,
        ] as number[]
      ).includes(actor.idRol)
    ) {
      return {};
    }
    throw new ForbiddenException('No tiene acceso a fincas');
  }

  private async findAccessibleLot(idLote: bigint, actor: LotActor) {
    const lot = await this.prisma.loteProduccion.findFirst({
      where: { AND: [{ idLote }, this.buildScope(actor)] },
      select: {
        idLote: true,
        idUnidad: true,
        fechaSiembra: true,
        fechaEstimadaCosecha: true,
        fechaCosecha: true,
      },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    return lot;
  }

  private serializeLot(lot: LotRow) {
    const { idVariedad, variedadCat, ...lotData } = lot;
    return {
      ...lotData,
      idLote: lot.idLote.toString(),
      idUnidad: lot.idUnidad.toString(),
      idFinca: lot.idFinca.toString(),
      idVariedad,
      variedad: variedadCat?.codigo ?? null,
      variedadNombre: variedadCat?.nombre ?? null,
      pesoCosechadoKg: lot.pesoCosechadoKg?.toString() ?? null,
      finca: {
        ...lot.finca,
        idFinca: lot.finca.idFinca.toString(),
        productor: {
          ...lot.finca.productor,
          idProductor: lot.finca.productor.idProductor.toString(),
        },
      },
    };
  }

  private parseId(value: string, label: string): bigint {
    if (!/^\d+$/.test(value) || BigInt(value) <= 0n) {
      throw new BadRequestException(`Identificador de ${label} inválido`);
    }
    return BigInt(value);
  }

  private requireText(value: string, label: string): string {
    const normalized = value?.trim();
    if (!normalized)
      throw new BadRequestException(`El campo ${label} es obligatorio`);
    return normalized;
  }

  private async resolveVariedadId(
    client: Pick<PrismaService, 'variedad'>,
    codigo: string,
  ): Promise<number> {
    const normalized = this.requireText(codigo, 'variedad');
    const variedad = await client.variedad.findUnique({
      where: { codigo: normalized },
      select: { idVariedad: true },
    });
    if (!variedad)
      throw new BadRequestException('La variedad no existe en el catálogo');
    return variedad.idVariedad;
  }

  private parseDate(value: string, label: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${label} inválida`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException(`${label} inválida`);
    return date;
  }

  private parseOptionalDate(
    value: string | null | undefined,
    label: string,
  ): Date | null {
    return value ? this.parseDate(value, label) : null;
  }

  private parsePositiveInteger(
    value: string | number | null | undefined,
    label: string,
  ): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(
        `${label} debe ser un entero mayor que cero`,
      );
    }
    return parsed;
  }

  private parsePositiveDecimal(
    value: string | number | null | undefined,
    label: string,
  ): Prisma.Decimal | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`${label} debe ser mayor que cero`);
    }
    return new Prisma.Decimal(parsed);
  }

  private parsePage(
    value: string | undefined,
    fallback: number,
    max = Number.MAX_SAFE_INTEGER,
  ) {
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
      throw new BadRequestException('Paginación inválida');
    }
    return parsed;
  }
}
