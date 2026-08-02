import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoLote, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCertificationDto } from './dto/create-certification.dto';
import type { CreateFarmDto } from './dto/create-farm.dto';
import type { UpdateCertificationDto } from './dto/update-certification.dto';
import type { UpdateFarmDto } from './dto/update-farm.dto';

const farmSelect = {
  idFinca: true,
  idProductor: true,
  codigoFinca: true,
  nombre: true,
  pais: true,
  region: true,
  localidad: true,
  sublocalidad: true,
  latitud: true,
  longitud: true,
  areaHectareas: true,
  estado: true,
  fechaActualizacion: true,
  productor: {
    select: {
      idProductor: true,
      identificacion: true,
      nombreRazonSocial: true,
    },
  },
  _count: {
    select: {
      lotes: { where: { estado: { not: EstadoLote.CERRADO } } },
      certificaciones: true,
    },
  },
} satisfies Prisma.FincaSelect;

const certificationSelect = {
  idCertificacion: true,
  idFinca: true,
  idTipoCertificacion: true,
  idEntidadCertificadora: true,
  tipoCertificacion: true,
  entidadCertificadora: true,
  numeroCertificado: true,
  fechaEmision: true,
  fechaVencimiento: true,
  documentoUrl: true,
  finca: {
    select: {
      idFinca: true,
      codigoFinca: true,
      nombre: true,
      productor: {
        select: { idProductor: true, nombreRazonSocial: true },
      },
    },
  },
} satisfies Prisma.CertificacionSelect;

type FarmRow = Prisma.FincaGetPayload<{ select: typeof farmSelect }>;
type CertificationRow = Prisma.CertificacionGetPayload<{
  select: typeof certificationSelect;
}>;
type FarmActor = Pick<AuthenticatedUser, 'idRol' | 'idProductor'>;
type CertificationData = {
  tipoCertificacion?: string;
  entidadEmisora?: string;
  numeroCertificado?: string;
  fechaEmision?: Date;
  fechaVencimiento?: Date | null;
  documentoUrl?: string | null;
};

@Injectable()
export class FarmsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFarmDto, actor: FarmActor) {
    const idProductor = await this.resolveProducerId(dto.idProductor, actor);
    const data = this.buildFarmCreateData(dto, idProductor);

    try {
      const farm = await this.prisma.finca.create({ data, select: farmSelect });
      return this.serializeFarm(farm);
    } catch (error) {
      this.rethrowKnownPrismaError(error);
    }
  }

  async findAll(query: Record<string, string | undefined>, actor: FarmActor) {
    const where = await this.buildFilters(query, actor);
    const farms = await this.prisma.finca.findMany({
      where,
      select: farmSelect,
      orderBy: [
        { estado: 'desc' },
        { pais: 'asc' },
        { region: 'asc' },
        { nombre: 'asc' },
      ],
    });
    return farms.map((farm) => this.serializeFarm(farm));
  }

  async dashboard(actor: FarmActor) {
    const farms = await this.prisma.finca.findMany({
      where: { AND: [this.buildScope(actor), { estado: true }] },
      select: farmSelect,
      orderBy: [{ pais: 'asc' }, { region: 'asc' }, { nombre: 'asc' }],
    });
    const serialized = farms.map((farm) => this.serializeFarm(farm));

    return {
      totalFincasActivas: serialized.length,
      totalLotesActivos: serialized.reduce(
        (total, farm) => total + farm.lotesActivos,
        0,
      ),
      totalCertificaciones: serialized.reduce(
        (total, farm) => total + farm.totalCertificaciones,
        0,
      ),
      fincas: serialized.map((farm) => ({
        idFinca: farm.idFinca,
        codigoFinca: farm.codigoFinca,
        nombre: farm.nombre,
        productor: farm.productor,
        lotesActivos: farm.lotesActivos,
      })),
    };
  }

  async findOne(id: string, actor: FarmActor) {
    const farm = await this.findAccessibleFarm(
      this.parseId(id, 'finca'),
      actor,
    );
    return this.serializeFarm(farm);
  }

  async update(id: string, dto: UpdateFarmDto, actor: FarmActor) {
    const idFinca = this.parseId(id, 'finca');
    const current = await this.findAccessibleFarm(idFinca, actor);
    const data: Prisma.FincaUpdateInput = {};

    if (dto.idProductor !== undefined) {
      const idProductor = await this.resolveProducerId(dto.idProductor, actor);
      data.productor = { connect: { idProductor } };
    }
    if (dto.nombre !== undefined) {
      data.nombre = this.requireText(dto.nombre, 'nombre');
    }
    if (dto.pais !== undefined) {
      data.pais = this.requireText(dto.pais, 'país');
    }
    if (dto.region !== undefined) {
      data.region = this.requireText(dto.region, 'región');
    }
    if (dto.localidad !== undefined) {
      data.localidad = this.requireText(dto.localidad, 'localidad');
    }
    if (dto.sublocalidad !== undefined) {
      data.sublocalidad = dto.sublocalidad?.trim() || null;
    }
    if (dto.latitud !== undefined) {
      data.latitud = this.parseCoordinate(dto.latitud, 'latitud', -90, 90);
    }
    if (dto.longitud !== undefined) {
      data.longitud = this.parseCoordinate(dto.longitud, 'longitud', -180, 180);
    }
    if (dto.areaHectareas !== undefined) {
      data.areaHectareas = this.parseArea(dto.areaHectareas);
    }
    if (dto.estado !== undefined) {
      if (typeof dto.estado !== 'boolean') {
        throw new BadRequestException('El estado debe ser booleano');
      }
      data.estado = dto.estado;
    }

    try {
      const farm = await this.prisma.finca.update({
        where: { idFinca: current.idFinca },
        data,
        select: farmSelect,
      });
      return this.serializeFarm(farm);
    } catch (error) {
      this.rethrowKnownPrismaError(error);
    }
  }

  async remove(id: string, actor: FarmActor) {
    const idFinca = this.parseId(id, 'finca');
    await this.findAccessibleFarm(idFinca, actor);
    const farm = await this.prisma.finca.update({
      where: { idFinca },
      data: { estado: false },
      select: farmSelect,
    });
    return this.serializeFarm(farm);
  }

  async findCertifications(actor: FarmActor, farmId?: string) {
    const idFinca = farmId ? this.parseId(farmId, 'finca') : null;
    if (idFinca) await this.findAccessibleFarm(idFinca, actor);

    const certifications = await this.prisma.certificacion.findMany({
      where: {
        ...(idFinca ? { idFinca } : {}),
        finca: this.buildScope(actor),
      },
      select: certificationSelect,
      orderBy: [{ fechaVencimiento: 'asc' }, { fechaEmision: 'desc' }],
    });
    return certifications.map((row) => this.serializeCertification(row));
  }

  async certificationOptions() {
    const [types, issuers] = await Promise.all([
      this.prisma.tipoCertificacion.findMany({
        where: { activo: true },
        select: { idTipoCertificacion: true, codigo: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.entidadCertificadora.findMany({
        where: { activo: true },
        select: {
          idEntidadCertificadora: true,
          codigo: true,
          nombre: true,
          alcance: true,
        },
        orderBy: { nombre: 'asc' },
      }),
    ]);
    return { types, issuers };
  }

  async createCertification(
    farmId: string,
    dto: CreateCertificationDto,
    actor: FarmActor,
  ) {
    const idFinca = this.parseId(farmId, 'finca');
    await this.findAccessibleFarm(idFinca, actor);
    const data = this.buildCertificationData(dto);
    const [idTipoCertificacion, idEntidadCertificadora] = await Promise.all([
      this.resolveCertificationType(data.tipoCertificacion!),
      this.resolveCertificationIssuer(data.entidadEmisora!),
    ]);

    try {
      const certification = await this.prisma.certificacion.create({
        data: {
          idFinca,
          idTipoCertificacion,
          idEntidadCertificadora,
          numeroCertificado: data.numeroCertificado!,
          fechaEmision: data.fechaEmision!,
          fechaVencimiento: data.fechaVencimiento,
          documentoUrl: data.documentoUrl,
        },
        select: certificationSelect,
      });
      return this.serializeCertification(certification);
    } catch (error) {
      this.rethrowKnownPrismaError(error);
    }
  }

  async updateCertification(
    farmId: string,
    certificationId: string,
    dto: UpdateCertificationDto,
    actor: FarmActor,
  ) {
    const idFinca = this.parseId(farmId, 'finca');
    const idCertificacion = this.parseId(certificationId, 'certificación');
    await this.findAccessibleFarm(idFinca, actor);
    const current = await this.ensureCertificationExists(
      idCertificacion,
      idFinca,
    );

    const data = this.buildCertificationData(dto, true);
    const emission = data.fechaEmision ?? current.fechaEmision;
    const expiration =
      data.fechaVencimiento === undefined
        ? current.fechaVencimiento
        : data.fechaVencimiento;
    if (expiration && expiration < emission) {
      throw new BadRequestException(
        'La fecha de vencimiento no puede ser anterior a la emisión',
      );
    }
    try {
      const updateData: Prisma.CertificacionUncheckedUpdateInput = {
        numeroCertificado: data.numeroCertificado,
        fechaEmision: data.fechaEmision,
        fechaVencimiento: data.fechaVencimiento,
        documentoUrl: data.documentoUrl,
      };
      if (data.tipoCertificacion !== undefined) {
        updateData.idTipoCertificacion = await this.resolveCertificationType(
          data.tipoCertificacion,
        );
      }
      if (data.entidadEmisora !== undefined) {
        updateData.idEntidadCertificadora =
          await this.resolveCertificationIssuer(data.entidadEmisora);
      }
      const certification = await this.prisma.certificacion.update({
        where: { idCertificacion },
        data: updateData,
        select: certificationSelect,
      });
      return this.serializeCertification(certification);
    } catch (error) {
      this.rethrowKnownPrismaError(error);
    }
  }

  async removeCertification(
    farmId: string,
    certificationId: string,
    actor: FarmActor,
  ) {
    const idFinca = this.parseId(farmId, 'finca');
    const idCertificacion = this.parseId(certificationId, 'certificación');
    await this.findAccessibleFarm(idFinca, actor);
    await this.ensureCertificationExists(idCertificacion, idFinca);
    await this.prisma.certificacion.delete({ where: { idCertificacion } });
    return { deleted: true };
  }

  private buildFarmCreateData(
    dto: CreateFarmDto,
    idProductor: bigint,
  ): Prisma.FincaUncheckedCreateInput {
    if (dto.estado !== undefined && typeof dto.estado !== 'boolean') {
      throw new BadRequestException('El estado debe ser booleano');
    }
    return {
      idProductor,
      nombre: this.requireText(dto.nombre, 'nombre'),
      pais: this.requireText(dto.pais, 'país'),
      region: this.requireText(dto.region, 'región'),
      localidad: this.requireText(dto.localidad, 'localidad'),
      sublocalidad: dto.sublocalidad?.trim() || null,
      latitud: this.parseCoordinate(dto.latitud, 'latitud', -90, 90),
      longitud: this.parseCoordinate(dto.longitud, 'longitud', -180, 180),
      areaHectareas: this.parseArea(dto.areaHectareas),
      estado: dto.estado ?? true,
    };
  }

  private buildCertificationData(
    dto: UpdateCertificationDto,
    partial = false,
  ): CertificationData {
    const data: CertificationData = {};
    if (!partial || dto.tipoCertificacion !== undefined) {
      data.tipoCertificacion = this.requireText(
        dto.tipoCertificacion ?? '',
        'tipo de certificación',
      );
    }
    if (!partial || dto.entidadEmisora !== undefined) {
      data.entidadEmisora = this.requireText(
        dto.entidadEmisora ?? '',
        'entidad emisora',
      );
    }
    if (!partial || dto.numeroCertificado !== undefined) {
      data.numeroCertificado = this.requireText(
        dto.numeroCertificado ?? '',
        'número de certificado',
      );
    }
    if (!partial || dto.fechaEmision !== undefined) {
      data.fechaEmision = this.parseDate(
        dto.fechaEmision ?? '',
        'fecha de emisión',
      );
    }
    if (dto.fechaVencimiento !== undefined) {
      data.fechaVencimiento = dto.fechaVencimiento
        ? this.parseDate(dto.fechaVencimiento, 'fecha de vencimiento')
        : null;
    }
    if (dto.documentoUrl !== undefined) {
      data.documentoUrl = this.parseOptionalUrl(dto.documentoUrl);
    }

    const emission = data.fechaEmision;
    const expiration = data.fechaVencimiento;
    if (emission && expiration && expiration < emission) {
      throw new BadRequestException(
        'La fecha de vencimiento no puede ser anterior a la emisión',
      );
    }
    return data;
  }

  private async buildFilters(
    query: Record<string, string | undefined>,
    actor: FarmActor,
  ): Promise<Prisma.FincaWhereInput> {
    const filters: Prisma.FincaWhereInput[] = [this.buildScope(actor)];
    const search = query.search?.trim();
    if (search) {
      filters.push({
        OR: [
          { codigoFinca: { contains: search, mode: 'insensitive' } },
          { nombre: { contains: search, mode: 'insensitive' } },
          { pais: { contains: search, mode: 'insensitive' } },
          { region: { contains: search, mode: 'insensitive' } },
          { localidad: { contains: search, mode: 'insensitive' } },
          {
            productor: {
              nombreRazonSocial: { contains: search, mode: 'insensitive' },
            },
          },
        ],
      });
    }
    if (query.pais?.trim()) {
      filters.push({
        pais: { contains: query.pais.trim(), mode: 'insensitive' },
      });
    }
    if (query.region?.trim()) {
      filters.push({
        region: { contains: query.region.trim(), mode: 'insensitive' },
      });
    }
    if (query.localidad?.trim()) {
      filters.push({
        localidad: { contains: query.localidad.trim(), mode: 'insensitive' },
      });
    }
    if (query.estado !== undefined && query.estado !== '') {
      filters.push({ estado: this.parseBoolean(query.estado, 'estado') });
    }
    if (query.idProductor) {
      const idProductor = this.parseId(query.idProductor, 'productor');
      if (
        actor.idRol === ROLE_IDS.SUPERVISOR_AGRICOLA &&
        actor.idProductor !== idProductor.toString()
      ) {
        throw new ForbiddenException('No tenés acceso a ese productor');
      }
      filters.push({ idProductor });
    }
    return { AND: filters };
  }

  private buildScope(actor: FarmActor): Prisma.FincaWhereInput {
    if (actor.idRol === ROLE_IDS.ADMINISTRADOR) return {};
    if (actor.idRol === ROLE_IDS.SUPERVISOR_AGRICOLA) {
      return actor.idProductor
        ? { idProductor: this.parseId(actor.idProductor, 'productor') }
        : { idFinca: { equals: -1n } };
    }
    throw new ForbiddenException('No tenés acceso a fincas');
  }

  private async resolveProducerId(
    requested: string | number | undefined,
    actor: FarmActor,
  ): Promise<bigint> {
    let idProductor: bigint;
    if (actor.idRol === ROLE_IDS.SUPERVISOR_AGRICOLA) {
      if (!actor.idProductor) {
        throw new BadRequestException(
          'Tu cuenta no está vinculada a un productor',
        );
      }
      idProductor = this.parseId(actor.idProductor, 'productor');
      if (
        requested !== undefined &&
        requested !== '' &&
        this.parseId(String(requested), 'productor') !== idProductor
      ) {
        throw new ForbiddenException(
          'No podés crear fincas para otro productor',
        );
      }
    } else if (actor.idRol === ROLE_IDS.ADMINISTRADOR) {
      if (requested === undefined || requested === '') {
        throw new BadRequestException('El productor es obligatorio');
      }
      idProductor = this.parseId(String(requested), 'productor');
    } else {
      throw new ForbiddenException('No tenés acceso a fincas');
    }

    const producer = await this.prisma.productor.findUnique({
      where: { idProductor },
      select: { idProductor: true },
    });
    if (!producer) throw new BadRequestException('El productor no existe');
    return idProductor;
  }

  private async findAccessibleFarm(idFinca: bigint, actor: FarmActor) {
    const farm = await this.prisma.finca.findFirst({
      where: { AND: [{ idFinca }, this.buildScope(actor)] },
      select: farmSelect,
    });
    if (!farm) throw new NotFoundException('Finca no encontrada');
    return farm;
  }

  private async ensureCertificationExists(
    idCertificacion: bigint,
    idFinca: bigint,
  ) {
    const certification = await this.prisma.certificacion.findFirst({
      where: { idCertificacion, idFinca },
      select: {
        idCertificacion: true,
        fechaEmision: true,
        fechaVencimiento: true,
      },
    });
    if (!certification) {
      throw new NotFoundException('Certificación no encontrada');
    }
    return certification;
  }

  private serializeFarm(row: FarmRow) {
    return {
      idFinca: row.idFinca.toString(),
      idProductor: row.idProductor.toString(),
      codigoFinca: row.codigoFinca,
      nombre: row.nombre,
      pais: row.pais,
      region: row.region,
      localidad: row.localidad,
      sublocalidad: row.sublocalidad,
      latitud: row.latitud?.toString() ?? null,
      longitud: row.longitud?.toString() ?? null,
      areaHectareas: row.areaHectareas?.toString() ?? null,
      estado: row.estado,
      fechaActualizacion: row.fechaActualizacion,
      productor: {
        ...row.productor,
        idProductor: row.productor.idProductor.toString(),
      },
      lotesActivos: row._count.lotes,
      totalCertificaciones: row._count.certificaciones,
    };
  }

  private serializeCertification(row: CertificationRow) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const status = !row.fechaVencimiento
      ? 'SIN_VENCIMIENTO'
      : row.fechaVencimiento < today
        ? 'VENCIDA'
        : 'VIGENTE';
    return {
      idCertificacion: row.idCertificacion.toString(),
      idFinca: row.idFinca.toString(),
      idTipoCertificacion: row.idTipoCertificacion,
      idEntidadCertificadora: row.idEntidadCertificadora,
      tipoCertificacion: row.tipoCertificacion.nombre,
      tipoCertificacionCodigo: row.tipoCertificacion.codigo,
      entidadEmisora: row.entidadCertificadora.nombre,
      entidadEmisoraCodigo: row.entidadCertificadora.codigo,
      numeroCertificado: row.numeroCertificado,
      fechaEmision: row.fechaEmision,
      fechaVencimiento: row.fechaVencimiento,
      documentoUrl: row.documentoUrl,
      estado: status,
      finca: {
        ...row.finca,
        idFinca: row.finca.idFinca.toString(),
        productor: {
          ...row.finca.productor,
          idProductor: row.finca.productor.idProductor.toString(),
        },
      },
    };
  }

  private async resolveCertificationType(codigo: string): Promise<number> {
    const type = await this.prisma.tipoCertificacion.findFirst({
      where: { codigo: codigo.trim().toUpperCase(), activo: true },
      select: { idTipoCertificacion: true },
    });
    if (!type) {
      throw new BadRequestException('Tipo de certificación no válido');
    }
    return type.idTipoCertificacion;
  }

  private async resolveCertificationIssuer(codigo: string): Promise<number> {
    const issuer = await this.prisma.entidadCertificadora.findFirst({
      where: { codigo: codigo.trim().toUpperCase(), activo: true },
      select: { idEntidadCertificadora: true },
    });
    if (!issuer) {
      throw new BadRequestException('Entidad certificadora no válida');
    }
    return issuer.idEntidadCertificadora;
  }

  private parseId(value: string, label: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(`Identificador de ${label} inválido`);
    }
    const id = BigInt(value);
    if (id <= 0n) {
      throw new BadRequestException(`Identificador de ${label} inválido`);
    }
    return id;
  }

  private requireText(value: string, label: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException(`El campo ${label} es obligatorio`);
    }
    return normalized;
  }

  private parseCoordinate(
    value: string | number | null | undefined,
    label: string,
    min: number,
    max: number,
  ): Prisma.Decimal | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(
        `${label} debe estar entre ${min} y ${max}`,
      );
    }
    return new Prisma.Decimal(parsed);
  }

  private parseArea(
    value: string | number | null | undefined,
  ): Prisma.Decimal | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('El área debe ser mayor que cero');
    }
    return new Prisma.Decimal(parsed);
  }

  private parseBoolean(value: string, label: string): boolean {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new BadRequestException(`${label} inválido`);
  }

  private parseDate(value: string, label: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${label} inválida`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} inválida`);
    }
    return date;
  }

  private parseOptionalUrl(value: string | null): string | null {
    const normalized = value?.trim();
    if (!normalized) return null;
    try {
      const url = new URL(normalized);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return normalized;
    } catch {
      throw new BadRequestException('La URL del documento es inválida');
    }
  }

  private rethrowKnownPrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('El código o certificado ya está registrado');
    }
    throw error;
  }
}
