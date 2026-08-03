import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDocumentDto } from './dto/create-document.dto';
import type { CreateEventDto } from './dto/create-event.dto';

type Actor = Pick<AuthenticatedUser, 'sub' | 'idRol' | 'idProductor'>;

const eventInclude = {
  tipoEvento: true,
  usuario: { select: { nombres: true, apellidos: true } },
  documentos: { include: { tipoDocumento: true } },
  unidad: {
    select: {
      codigo: true,
      tipo: true,
      lote: {
        select: {
          idLote: true,
          codigoLote: true,
          finca: { select: { nombre: true } },
        },
      },
      empaque: { select: { idEmpaque: true, codigoCaja: true } },
      envio: { select: { idEnvio: true, codigoEnvio: true } },
    },
  },
  ejecucion: { select: { fase: { select: { codigo: true, nombre: true } } } },
} satisfies Prisma.EventoTrazabilidadInclude;

type EventRow = Prisma.EventoTrazabilidadGetPayload<{
  include: typeof eventInclude;
}>;

@Injectable()
export class TraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────── Catálogo de tipos de evento ──────────────

  async getEventTypes() {
    return this.prisma.tipoEvento.findMany({
      orderBy: { idTipoEvento: 'asc' },
    });
  }

  async getDocumentTypes() {
    return this.prisma.tipoDocumento.findMany({
      where: { activo: true },
      select: {
        idTipoDocumento: true,
        codigo: true,
        nombre: true,
        descripcion: true,
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async getOptions(actor: Actor) {
    const scope = this.buildScope(actor);
    const [eventTypes, documentTypes, users] = await Promise.all([
      this.getEventTypes(),
      this.getDocumentTypes(),
      this.prisma.eventoTrazabilidad.findMany({
        where: scope,
        distinct: ['idUsuario'],
        orderBy: { idUsuario: 'asc' },
        select: {
          idUsuario: true,
          usuario: { select: { nombres: true, apellidos: true } },
        },
      }),
    ]);

    return {
      eventTypes,
      documentTypes,
      users: users.map(({ idUsuario, usuario }) => ({
        idUsuario: idUsuario.toString(),
        nombre: `${usuario.nombres} ${usuario.apellidos}`.trim(),
      })),
    };
  }

  async searchUnitByCode(codigoRaw: string, actor: Actor) {
    const codigo = codigoRaw?.trim();
    if (!codigo) throw new BadRequestException('Debe indicar un código');

    const unit = await this.prisma.unidadTrazable.findFirst({
      where: { codigo },
      select: {
        idUnidad: true,
        tipo: true,
        codigo: true,
        ...this.unitScopeSelect(),
      },
      orderBy: { tipo: 'asc' as const },
    });

    if (!unit) {
      throw new NotFoundException('Código no encontrado o sin permisos');
    }

    try {
      this.assertUnitAccess(unit as any, actor);
    } catch {
      throw new NotFoundException('Código no encontrado o sin permisos');
    }

    return {
      idUnidad: unit.idUnidad.toString(),
      tipo: unit.tipo,
      codigo: unit.codigo,
    };
  }

  async findAll(query: Record<string, string | undefined>, actor: Actor) {
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(query.pageSize ?? '20', 10) || 20),
    );
    const where = this.buildEventFilters(null, query, actor);

    const [data, total, units, documents] = await Promise.all([
      this.prisma.eventoTrazabilidad.findMany({
        where,
        orderBy: { fechaEvento: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: eventInclude,
      }),
      this.prisma.eventoTrazabilidad.count({ where }),
      this.prisma.eventoTrazabilidad.findMany({
        where,
        distinct: ['idUnidad'],
        select: { idUnidad: true },
      }),
      this.prisma.documentoReferencia.count({ where: { evento: where } }),
    ]);

    return {
      data: data.map((event) => this.serializeEvent(event)),
      summary: { total, units: units.length, documents },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  // ────────────── Registrar evento ──────────────

  async createEvent(dto: CreateEventDto, actor: Actor) {
    const idUsuario = this.parseId(actor.sub, 'usuario');
    const idUnidad = this.parseId(dto.idUnidad, 'unidad trazable');
    const idEjecucion = this.parseId(dto.idEjecucion, 'ejecución de fase');

    const unit = await this.prisma.unidadTrazable.findUnique({
      where: { idUnidad },
      select: { idUnidad: true, ...this.unitScopeSelect() },
    });
    if (!unit) throw new NotFoundException('Unidad trazable no encontrada');
    this.assertUnitAccess(unit, actor);

    // Verify the execution exists and the actor has access
    const execution = await this.prisma.faseEjecucion.findUnique({
      where: { idEjecucion },
      select: {
        idEjecucion: true,
        instancia: {
          select: {
            idInstancia: true,
            unidades: { where: { idUnidad }, select: { idUnidad: true } },
          },
        },
      },
    });
    if (!execution)
      throw new NotFoundException('Ejecución de fase no encontrada');
    if (execution.instancia.unidades.length === 0) {
      throw new BadRequestException(
        'La ejecución seleccionada no pertenece a la unidad trazable',
      );
    }

    // Verify event type exists
    const eventType = await this.prisma.tipoEvento.findUnique({
      where: { idTipoEvento: dto.idTipoEvento },
      select: { idTipoEvento: true },
    });
    if (!eventType) throw new NotFoundException('Tipo de evento no encontrado');

    const fechaEvento = new Date(dto.fechaEvento);
    if (isNaN(fechaEvento.getTime())) {
      throw new BadRequestException('La fecha del evento no es válida');
    }

    const event = await this.prisma.eventoTrazabilidad.create({
      data: {
        idUnidad,
        idEjecucion,
        idTipoEvento: dto.idTipoEvento,
        idUsuario,
        fechaEvento,
        ubicacion: dto.ubicacion?.trim() || null,
        descripcion: dto.descripcion?.trim() || null,
        datosAdicionales: (dto.datosAdicionales ?? {}) as Prisma.InputJsonValue,
      },
      include: eventInclude,
    });

    return this.serializeEvent(event);
  }

  // ────────────── Timeline de una unidad trazable ──────────────

  async getTimeline(
    idUnidad: string,
    query: Record<string, string | undefined>,
    actor: Actor,
  ) {
    const id = this.parseId(idUnidad, 'unidad trazable');

    const unit = await this.prisma.unidadTrazable.findUnique({
      where: { idUnidad: id },
      select: { idUnidad: true, ...this.unitScopeSelect() },
    });
    if (!unit) throw new NotFoundException('Unidad trazable no encontrada');
    this.assertUnitAccess(unit, actor);

    const where = this.buildEventFilters(id, query, actor);

    const events = await this.prisma.eventoTrazabilidad.findMany({
      where,
      orderBy: { fechaEvento: 'asc' },
      include: eventInclude,
    });

    return events.map((e) => this.serializeEvent(e));
  }

  // ────────────── Detalle de un evento ──────────────

  async getEvent(id: string, actor: Actor) {
    const idEvento = this.parseId(id, 'evento');
    const event = await this.prisma.eventoTrazabilidad.findUnique({
      where: { idEvento },
      include: eventInclude,
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    await this.assertEventAccess(event.idUnidad, actor);
    return this.serializeEvent(event);
  }

  // ────────────── Adjuntar documento de referencia ──────────────

  async addDocument(eventId: string, dto: CreateDocumentDto, actor: Actor) {
    const idEvento = this.parseId(eventId, 'evento');

    const event = await this.prisma.eventoTrazabilidad.findUnique({
      where: { idEvento },
      select: { idEvento: true, idUsuario: true },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    await this.assertEventAccessById(idEvento, actor);

    // Only the event creator or admin can attach documents
    if (
      actor.idRol !== ROLE_IDS.ADMINISTRADOR &&
      event.idUsuario.toString() !== actor.sub
    ) {
      throw new ForbiddenException(
        'Solo el creador del evento o un administrador pueden adjuntar documentos',
      );
    }

    const documentType = await this.prisma.tipoDocumento.findFirst({
      where: { codigo: dto.tipo.trim().toUpperCase(), activo: true },
      select: { idTipoDocumento: true },
    });
    if (!documentType) {
      throw new BadRequestException('Tipo de documento no válido');
    }
    if (!dto.nombre?.trim() || !dto.url?.trim()) {
      throw new BadRequestException(
        'El nombre y la URL del documento son obligatorios',
      );
    }
    try {
      const url = new URL(dto.url.trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      throw new BadRequestException('La URL del documento no es válida');
    }

    const doc = await this.prisma.documentoReferencia.create({
      data: {
        idEvento,
        idTipoDocumento: documentType.idTipoDocumento,
        nombre: dto.nombre.trim(),
        url: dto.url.trim(),
      },
      include: { tipoDocumento: true },
    });

    return this.serializeDocument(doc);
  }

  // ────────────── Helpers ──────────────

  private buildEventFilters(
    idUnidad: bigint | null,
    query: Record<string, string | undefined>,
    actor: Actor,
  ): Prisma.EventoTrazabilidadWhereInput {
    const filters: Prisma.EventoTrazabilidadWhereInput[] = [
      this.buildScope(actor),
    ];
    if (idUnidad !== null) filters.push({ idUnidad });

    if (query.idTipoEvento) {
      const t = parseInt(query.idTipoEvento, 10);
      if (!isNaN(t)) filters.push({ idTipoEvento: t });
    }

    if (query.idUsuario) {
      const u = this.parseSafeId(query.idUsuario);
      if (u !== null) filters.push({ idUsuario: u });
    }

    if (query.desde || query.hasta) {
      const range: Prisma.DateTimeFilter = {};
      if (query.desde) {
        const d = new Date(query.desde);
        if (!isNaN(d.getTime())) range.gte = d;
      }
      if (query.hasta) {
        const h = new Date(query.hasta);
        if (!isNaN(h.getTime())) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(query.hasta))
            h.setUTCHours(23, 59, 59, 999);
          range.lte = h;
        }
      }
      filters.push({ fechaEvento: range });
    }

    const search = query.search?.trim();
    if (search) {
      filters.push({
        OR: [
          { unidad: { codigo: { contains: search, mode: 'insensitive' } } },
          {
            unidad: {
              lote: { codigoLote: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            unidad: {
              empaque: {
                codigoCaja: { contains: search, mode: 'insensitive' },
              },
            },
          },
          {
            unidad: {
              envio: { codigoEnvio: { contains: search, mode: 'insensitive' } },
            },
          },
          { descripcion: { contains: search, mode: 'insensitive' } },
          { ubicacion: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return { AND: filters };
  }

  private serializeEvent(event: EventRow) {
    return {
      idEvento: event.idEvento.toString(),
      idUnidad: event.idUnidad.toString(),
      idEjecucion: event.idEjecucion.toString(),
      idUsuario: event.idUsuario.toString(),
      tipoEvento: {
        id: event.tipoEvento.idTipoEvento,
        nombre: event.tipoEvento.nombre,
        descripcion: event.tipoEvento.descripcion,
      },
      fechaEvento: event.fechaEvento,
      ubicacion: event.ubicacion,
      descripcion: event.descripcion,
      datosAdicionales: event.datosAdicionales as unknown as Record<string, unknown>,
      fechaRegistro: event.fechaRegistro,
      usuario: `${event.usuario.nombres} ${event.usuario.apellidos}`.trim(),
      unidad: {
        codigo: event.unidad.codigo,
        tipo: event.unidad.tipo,
        referencia:
          event.unidad.lote?.codigoLote ??
          event.unidad.empaque?.codigoCaja ??
          event.unidad.envio?.codigoEnvio ??
          event.unidad.codigo,
        idLote: event.unidad.lote?.idLote.toString() ?? null,
        finca: event.unidad.lote?.finca.nombre ?? null,
      },
      fase: event.ejecucion.fase,
      documentos: event.documentos.map((document) =>
        this.serializeDocument(document),
      ),
    };
  }

  private buildScope(actor: Actor): Prisma.EventoTrazabilidadWhereInput {
    if (
      actor.idRol !== ROLE_IDS.SUPERVISOR_AGRICOLA &&
      actor.idRol !== ROLE_IDS.GERENTE_PRODUCTOR
    ) {
      return {};
    }
    if (!actor.idProductor) return { idEvento: -1n };
    const idProductor = this.parseId(actor.idProductor, 'productor');
    return {
      OR: [
        { unidad: { lote: { finca: { idProductor } } } },
        { unidad: { empaque: { lote: { finca: { idProductor } } } } },
        {
          unidad: {
            envio: {
              empaques: {
                some: { empaque: { lote: { finca: { idProductor } } } },
              },
            },
          },
        },
      ],
    };
  }

  private unitScopeSelect() {
    return {
      lote: { select: { finca: { select: { idProductor: true } } } },
      empaque: {
        select: {
          lote: { select: { finca: { select: { idProductor: true } } } },
        },
      },
      envio: {
        select: {
          empaques: {
            select: {
              empaque: {
                select: {
                  lote: {
                    select: { finca: { select: { idProductor: true } } },
                  },
                },
              },
            },
          },
        },
      },
    } as const;
  }

  private assertUnitAccess(
    unit: Prisma.UnidadTrazableGetPayload<{
      select: ReturnType<TraceabilityService['unitScopeSelect']>;
    }> & { idUnidad: bigint },
    actor: Actor,
  ) {
    if (
      actor.idRol !== ROLE_IDS.SUPERVISOR_AGRICOLA &&
      actor.idRol !== ROLE_IDS.GERENTE_PRODUCTOR
    ) {
      return;
    }
    const producerId = actor.idProductor;
    const accessible =
      !!producerId &&
      (unit.lote?.finca.idProductor.toString() === producerId ||
        unit.empaque?.lote.finca.idProductor.toString() === producerId ||
        unit.envio?.empaques.some(
          ({ empaque }) =>
            empaque.lote.finca.idProductor.toString() === producerId,
        ));
    if (!accessible)
      throw new ForbiddenException('No tiene acceso a esta unidad trazable');
  }

  private async assertEventAccess(idUnidad: bigint, actor: Actor) {
    const unit = await this.prisma.unidadTrazable.findUnique({
      where: { idUnidad },
      select: { idUnidad: true, ...this.unitScopeSelect() },
    });
    if (!unit) throw new NotFoundException('Unidad trazable no encontrada');
    this.assertUnitAccess(unit, actor);
  }

  private async assertEventAccessById(idEvento: bigint, actor: Actor) {
    const event = await this.prisma.eventoTrazabilidad.findUnique({
      where: { idEvento },
      select: { idUnidad: true },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    await this.assertEventAccess(event.idUnidad, actor);
  }

  private serializeDocument(
    document: Prisma.DocumentoReferenciaGetPayload<{
      include: { tipoDocumento: true };
    }>,
  ) {
    return {
      idDocumento: document.idDocumento.toString(),
      nombre: document.nombre,
      tipo: document.tipoDocumento.nombre,
      tipoCodigo: document.tipoDocumento.codigo,
      url: document.url,
      fechaCarga: document.fechaCarga,
    };
  }

  private parseId(raw: string, label: string): bigint {
    try {
      const n = BigInt(raw);
      if (n > 0n) return n;
    } catch {
      // fall through
    }
    throw new BadRequestException(`ID de ${label} no válido`);
  }

  private parseSafeId(raw: string): bigint | null {
    try {
      const n = BigInt(raw);
      return n > 0n ? n : null;
    } catch {
      return null;
    }
  }
}
