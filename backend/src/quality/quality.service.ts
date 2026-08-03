import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResultadoControl } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateQualityControlDto } from './dto/create-quality-control.dto';

type Actor = Pick<AuthenticatedUser, 'sub' | 'idRol' | 'idProductor'>;

const qualityInclude = {
  usuario: { select: { nombres: true, apellidos: true } },
  lote: { select: { codigoLote: true } },
  categoriaCalidadCat: { select: { codigo: true, nombre: true } },
} satisfies Prisma.ControlCalidadInclude;

type QualityRow = Prisma.ControlCalidadGetPayload<{
  include: typeof qualityInclude;
}>;

@Injectable()
export class QualityService {
  constructor(private readonly prisma: PrismaService) {}

  async getCategories() {
    return this.prisma.categoriaCalidad.findMany({
      where: { activo: true },
      select: {
        idCategoriaCalidad: true,
        codigo: true,
        nombre: true,
        descripcion: true,
      },
      orderBy: { nombre: 'asc' },
    });
  }

  // ────────────── Listar todos los controles (global) ──────────────

  async findAll(query: Record<string, string | undefined>, actor: Actor) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize ?? '20', 10) || 20),
    );

    const filters: Prisma.ControlCalidadWhereInput[] = [this.buildScope(actor)];
    if (
      query.resultado &&
      Object.values(ResultadoControl).includes(
        query.resultado as ResultadoControl,
      )
    ) {
      filters.push({ resultado: query.resultado as ResultadoControl });
    }
    if (query.idLote) {
      const id = this.parseSafeId(query.idLote);
      if (id !== null) filters.push({ idLote: id });
    }
    if (query.search?.trim()) {
      filters.push({
        lote: {
          codigoLote: { contains: query.search.trim(), mode: 'insensitive' },
        },
      });
    }
    const where: Prisma.ControlCalidadWhereInput = { AND: filters };

    const [data, total, summaryRows] = await this.prisma.$transaction([
      this.prisma.controlCalidad.findMany({
        where,
        orderBy: { fechaControl: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: qualityInclude,
      }),
      this.prisma.controlCalidad.count({ where }),
      this.prisma.controlCalidad.findMany({
        where,
        select: { resultado: true, porcentajeRechazo: true },
      }),
    ]);

    const summary = this.buildSummary(summaryRows);
    return {
      data: data.map((c) => this.serialize(c)),
      summary,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async create(dto: CreateQualityControlDto, actor: Actor) {
    const idUsuario = this.parseId(actor.sub, 'usuario');
    const idEjecucion = this.parseId(dto.idEjecucion, 'ejecución de fase');
    const idLote = this.parseId(dto.idLote, 'lote');

    const lot = await this.prisma.loteProduccion.findUnique({
      where: { idLote },
      select: {
        idLote: true,
        idUnidad: true,
        estado: true,
        finca: { select: { idProductor: true } },
      },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    this.assertProducerAccess(lot.finca.idProductor, actor);

    const execution = await this.prisma.faseEjecucion.findUnique({
      where: { idEjecucion },
      select: {
        idEjecucion: true,
        estado: true,
        fase: { select: { codigo: true } },
        instancia: {
          select: {
            unidades: {
              where: { idUnidad: lot.idUnidad },
              select: { idUnidad: true },
            },
          },
        },
      },
    });
    if (!execution)
      throw new NotFoundException('Ejecución de fase no encontrada');
    if (
      execution.instancia.unidades.length === 0 ||
      execution.fase.codigo !== 'CALIDAD'
    ) {
      throw new BadRequestException(
        'La inspección debe vincularse a la fase de control de calidad del lote',
      );
    }
    if (execution.estado !== 'EN_PROCESO') {
      throw new ConflictException(
        'La fase de control de calidad ya no está activa',
      );
    }

    const resultado = dto.resultado as ResultadoControl;
    if (!Object.values(ResultadoControl).includes(resultado)) {
      throw new BadRequestException(
        `Resultado inválido. Use: ${Object.values(ResultadoControl).join(', ')}`,
      );
    }

    const pesoMuestraKg = this.parseDecimal(dto.pesoMuestraKg, 'peso muestra');
    const pesoRechazadoKg = this.parseDecimal(
      dto.pesoRechazadoKg,
      'peso rechazado',
    );
    const calibreMm = this.parseDecimal(dto.calibreMm, 'calibre');
    const idCategoriaCalidad = dto.categoriaCalidad
      ? await this.resolveCategory(dto.categoriaCalidad)
      : null;

    // 5.3 — Calculate rejection percentage automatically
    let porcentajeRechazo: Prisma.Decimal | null = null;
    if (pesoMuestraKg !== null && pesoMuestraKg > 0) {
      if (pesoRechazadoKg !== null) {
        if (pesoRechazadoKg > pesoMuestraKg) {
          throw new BadRequestException('El peso rechazado no puede ser mayor al peso de la muestra');
        }
        const pct = (pesoRechazadoKg / pesoMuestraKg) * 100;
        porcentajeRechazo = new Prisma.Decimal(pct.toFixed(2));
      }
    } else if (pesoRechazadoKg !== null && pesoRechazadoKg > 0) {
      throw new BadRequestException('Debe indicar un peso de muestra mayor a 0 si hay peso rechazado');
    }

    if ((resultado === 'OBSERVADO' || resultado === 'RECHAZADO') && !idCategoriaCalidad) {
      throw new BadRequestException('Debe seleccionar una categoría de calidad para resultados observados o rechazados');
    }

    const control = await this.prisma.controlCalidad.create({
      data: {
        idEjecucion,
        idLote,
        idUsuario,
        idCategoriaCalidad,
        calibreMm: calibreMm !== null ? new Prisma.Decimal(calibreMm) : null,
        pesoMuestraKg:
          pesoMuestraKg !== null ? new Prisma.Decimal(pesoMuestraKg) : null,
        porcentajeRechazo,
        resultado,
        observaciones: dto.observaciones?.trim() || null,
      },
      include: qualityInclude,
    });

    return this.serialize(control);
  }

  // ────────────── Listar controles por lote ──────────────

  async findByLot(
    lotId: string,
    query: Record<string, string | undefined>,
    actor: Actor,
  ) {
    const idLote = this.parseId(lotId, 'lote');
    const lot = await this.prisma.loteProduccion.findUnique({
      where: { idLote },
      select: { idLote: true, finca: { select: { idProductor: true } } },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    this.assertProducerAccess(lot.finca.idProductor, actor);

    const where: Prisma.ControlCalidadWhereInput = { idLote };
    if (
      query.resultado &&
      Object.values(ResultadoControl).includes(
        query.resultado as ResultadoControl,
      )
    ) {
      where.resultado = query.resultado as ResultadoControl;
    }

    const controls = await this.prisma.controlCalidad.findMany({
      where,
      orderBy: { fechaControl: 'desc' },
      include: qualityInclude,
    });

    const summary = this.buildSummary(controls);
    return { data: controls.map((c) => this.serialize(c)), summary };
  }

  // ────────────── Detalle de un control ──────────────

  async findOne(id: string, actor: Actor) {
    const idControl = this.parseId(id, 'control de calidad');
    const control = await this.prisma.controlCalidad.findUnique({
      where: { idControl },
      include: qualityInclude,
    });
    if (!control)
      throw new NotFoundException('Control de calidad no encontrado');
    await this.assertLotAccess(control.idLote, actor);
    return this.serialize(control);
  }

  // ────────────── Verificar si el lote está bloqueado (5.4) ──────────────

  async getLotQualityStatus(lotId: string, actor: Actor) {
    const idLote = this.parseId(lotId, 'lote');
    await this.assertLotAccess(idLote, actor);

    const lastControl = await this.prisma.controlCalidad.findFirst({
      where: { idLote },
      orderBy: { fechaControl: 'desc' },
      select: { resultado: true, fechaControl: true },
    });

    const isBlocked = lastControl?.resultado === ResultadoControl.RECHAZADO;

    return {
      hasControls: !!lastControl,
      lastResult: lastControl?.resultado ?? null,
      lastControlDate: lastControl?.fechaControl ?? null,
      isBlocked,
      blockReason: isBlocked
        ? 'El último control de calidad resultó RECHAZADO. No se puede avanzar a empaque hasta aprobar una nueva inspección.'
        : null,
    };
  }

  // ────────────── Helpers ──────────────

  private buildSummary(
    controls: Array<{
      resultado: ResultadoControl;
      porcentajeRechazo: Prisma.Decimal | null;
    }>,
  ) {
    const total = controls.length;
    const approved = controls.filter(
      (c) => c.resultado === ResultadoControl.APROBADO,
    ).length;
    const observed = controls.filter(
      (c) => c.resultado === ResultadoControl.OBSERVADO,
    ).length;
    const rejected = controls.filter(
      (c) => c.resultado === ResultadoControl.RECHAZADO,
    ).length;

    const pcts = controls
      .filter((c) => c.porcentajeRechazo !== null)
      .map((c) => Number(c.porcentajeRechazo));
    const avgRejectionPct =
      pcts.length > 0
        ? Number((pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(2))
        : null;

    return { total, approved, observed, rejected, avgRejectionPct };
  }

  private buildScope(actor: Actor): Prisma.ControlCalidadWhereInput {
    if (
      actor.idRol !== ROLE_IDS.SUPERVISOR_AGRICOLA &&
      actor.idRol !== ROLE_IDS.GERENTE_PRODUCTOR
    ) {
      return {};
    }
    return actor.idProductor
      ? {
          lote: {
            finca: {
              idProductor: this.parseId(actor.idProductor, 'productor'),
            },
          },
        }
      : { idControl: -1n };
  }

  private async assertLotAccess(idLote: bigint, actor: Actor) {
    if (
      actor.idRol !== ROLE_IDS.SUPERVISOR_AGRICOLA &&
      actor.idRol !== ROLE_IDS.GERENTE_PRODUCTOR
    ) {
      return;
    }
    const lot = await this.prisma.loteProduccion.findUnique({
      where: { idLote },
      select: { finca: { select: { idProductor: true } } },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    this.assertProducerAccess(lot.finca.idProductor, actor);
  }

  private assertProducerAccess(idProductor: bigint, actor: Actor) {
    if (
      (actor.idRol === ROLE_IDS.SUPERVISOR_AGRICOLA ||
        actor.idRol === ROLE_IDS.GERENTE_PRODUCTOR) &&
      (!actor.idProductor || idProductor.toString() !== actor.idProductor)
    ) {
      throw new ForbiddenException('No tiene acceso a este lote');
    }
  }

  private serialize(control: QualityRow) {
    return {
      idControl: control.idControl.toString(),
      idEjecucion: control.idEjecucion.toString(),
      idLote: control.idLote.toString(),
      codigoLote: control.lote.codigoLote,
      fechaControl: control.fechaControl,
      categoriaCalidad: control.categoriaCalidadCat?.nombre ?? null,
      categoriaCalidadCodigo: control.categoriaCalidadCat?.codigo ?? null,
      calibreMm: control.calibreMm ? Number(control.calibreMm) : null,
      pesoMuestraKg: control.pesoMuestraKg
        ? Number(control.pesoMuestraKg)
        : null,
      porcentajeRechazo: control.porcentajeRechazo
        ? Number(control.porcentajeRechazo)
        : null,
      resultado: control.resultado,
      observaciones: control.observaciones,
      inspector:
        `${control.usuario.nombres} ${control.usuario.apellidos}`.trim(),
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

  private async resolveCategory(codigo: string): Promise<number> {
    const category = await this.prisma.categoriaCalidad.findFirst({
      where: { codigo: codigo.trim().toUpperCase(), activo: true },
      select: { idCategoriaCalidad: true },
    });
    if (!category) {
      throw new BadRequestException('Categoría de calidad no válida');
    }
    return category.idCategoriaCalidad;
  }

  private parseDecimal(
    raw: number | string | null | undefined,
    label: string,
  ): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (isNaN(n) || n < 0) {
      throw new BadRequestException(`${label} debe ser un número positivo`);
    }
    return n;
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
