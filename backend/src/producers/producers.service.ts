import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProducerDto } from './dto/create-producer.dto';
import type { UpdateProducerDto } from './dto/update-producer.dto';

const producerSelect = {
  idProductor: true,
  identificacion: true,
  nombreRazonSocial: true,
  telefono: true,
  correo: true,
  direccion: true,
  fechaActualizacion: true,
  usuarios: {
    orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
    select: {
      idUsuario: true,
      nombres: true,
      apellidos: true,
      correo: true,
      estado: true,
    },
  },
  _count: { select: { fincas: true, usuarios: true } },
} satisfies Prisma.ProductorSelect;

type ProducerRow = Prisma.ProductorGetPayload<{
  select: typeof producerSelect;
}>;
type ProducerActor = Pick<AuthenticatedUser, 'idRol' | 'idProductor'>;

@Injectable()
export class ProducersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProducerDto) {
    const identificacion = this.requireText(
      dto.identificacion,
      'identificación',
    );
    const nombreRazonSocial = this.requireText(
      dto.nombreRazonSocial,
      'razón social',
    );
    const userIds = this.parseUserIds(dto.idUsuarios ?? []);

    if (dto.correo) this.validateEmail(dto.correo);
    await this.ensureIdNotTaken(identificacion);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const producer = await tx.productor.create({
          data: {
            identificacion,
            nombreRazonSocial,
            telefono: dto.telefono?.trim() || null,
            correo: dto.correo?.trim().toLowerCase() || null,
            direccion: dto.direccion?.trim() || null,
          },
          select: { idProductor: true },
        });

        await this.reconcileUsers(tx, producer.idProductor, userIds);
        const result = await tx.productor.findUniqueOrThrow({
          where: { idProductor: producer.idProductor },
          select: producerSelect,
        });
        return this.serialize(result);
      });
    } catch (error) {
      this.rethrowKnownPrismaError(error);
    }
  }

  async findAssignableUsers(producerId?: string) {
    const idProductor = producerId ? this.parseId(producerId) : null;
    if (idProductor) await this.ensureExists(idProductor);

    const users = await this.prisma.usuario.findMany({
      where: {
        idRol: ROLE_IDS.PRODUCTOR,
        OR: [
          { estado: true, idProductor: null },
          ...(idProductor ? [{ idProductor }] : []),
        ],
      },
      select: {
        idUsuario: true,
        nombres: true,
        apellidos: true,
        correo: true,
        estado: true,
        idProductor: true,
      },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
    });

    return users.map((user) => ({
      ...user,
      idUsuario: user.idUsuario.toString(),
      idProductor: user.idProductor?.toString() ?? null,
    }));
  }

  async findAll(actor: ProducerActor) {
    const where = this.buildScope(actor);
    const producers = await this.prisma.productor.findMany({
      where,
      select: producerSelect,
      orderBy: { nombreRazonSocial: 'asc' },
    });

    return producers.map((producer) => this.serialize(producer));
  }

  async findOne(id: string, actor: ProducerActor) {
    const idProductor = this.parseId(id);
    const producer = await this.prisma.productor.findFirst({
      where: { AND: [{ idProductor }, this.buildScope(actor)] },
      select: producerSelect,
    });

    if (!producer) throw new NotFoundException('Productor no encontrado');
    return this.serialize(producer);
  }

  async update(id: string, dto: UpdateProducerDto, actor: ProducerActor) {
    const idProductor = this.parseId(id);
    await this.ensureAccessible(idProductor, actor);

    if (
      actor.idRol !== ROLE_IDS.ADMINISTRADOR &&
      dto.idUsuarios !== undefined
    ) {
      throw new ForbiddenException(
        'Solo un administrador puede modificar las cuentas vinculadas',
      );
    }

    const data: Prisma.ProductorUpdateInput = {};
    if (dto.identificacion !== undefined) {
      const identificacion = this.requireText(
        dto.identificacion,
        'identificación',
      );
      const duplicate = await this.prisma.productor.findFirst({
        where: { identificacion, NOT: { idProductor } },
        select: { idProductor: true },
      });
      if (duplicate) {
        throw new ConflictException('La identificación ya está registrada');
      }
      data.identificacion = identificacion;
    }
    if (dto.nombreRazonSocial !== undefined) {
      data.nombreRazonSocial = this.requireText(
        dto.nombreRazonSocial,
        'razón social',
      );
    }
    if (dto.telefono !== undefined) {
      data.telefono = dto.telefono?.trim() || null;
    }
    if (dto.direccion !== undefined) {
      data.direccion = dto.direccion?.trim() || null;
    }
    if (dto.correo !== undefined) {
      if (dto.correo) {
        this.validateEmail(dto.correo);
        data.correo = dto.correo.trim().toLowerCase();
      } else {
        data.correo = null;
      }
    }

    const userIds =
      dto.idUsuarios === undefined
        ? undefined
        : this.parseUserIds(dto.idUsuarios);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.productor.update({ where: { idProductor }, data });
        if (userIds) await this.reconcileUsers(tx, idProductor, userIds);

        const producer = await tx.productor.findUniqueOrThrow({
          where: { idProductor },
          select: producerSelect,
        });
        return this.serialize(producer);
      });
    } catch (error) {
      this.rethrowKnownPrismaError(error);
    }
  }

  async remove(id: string) {
    const idProductor = this.parseId(id);
    await this.ensureExists(idProductor);

    const fincaCount = await this.prisma.finca.count({
      where: { idProductor },
    });
    if (fincaCount > 0) {
      throw new BadRequestException(
        `No se puede eliminar: el productor tiene ${fincaCount} finca(s) asociada(s)`,
      );
    }

    await this.prisma.productor.delete({ where: { idProductor } });
    return { deleted: true };
  }

  private buildScope(actor: ProducerActor): Prisma.ProductorWhereInput {
    if (actor.idRol === ROLE_IDS.ADMINISTRADOR) return {};
    if (actor.idRol === ROLE_IDS.PRODUCTOR) {
      return actor.idProductor
        ? { idProductor: this.parseId(actor.idProductor) }
        : { idProductor: { equals: -1n } };
    }
    throw new ForbiddenException('No tenés acceso a productores');
  }

  private async ensureAccessible(
    idProductor: bigint,
    actor: ProducerActor,
  ): Promise<void> {
    const producer = await this.prisma.productor.findFirst({
      where: { AND: [{ idProductor }, this.buildScope(actor)] },
      select: { idProductor: true },
    });
    if (!producer) throw new NotFoundException('Productor no encontrado');
  }

  private async reconcileUsers(
    tx: Prisma.TransactionClient,
    idProductor: bigint,
    userIds: bigint[],
  ): Promise<void> {
    const users = await tx.usuario.findMany({
      where: { idUsuario: { in: userIds } },
      select: { idUsuario: true, idRol: true, idProductor: true },
    });
    if (users.length !== userIds.length) {
      throw new BadRequestException(
        'Una o más cuentas seleccionadas no existen',
      );
    }

    for (const user of users) {
      if (user.idRol !== ROLE_IDS.PRODUCTOR) {
        throw new BadRequestException(
          'Solo se pueden vincular cuentas con rol PRODUCTOR',
        );
      }
      if (user.idProductor !== null && user.idProductor !== idProductor) {
        throw new ConflictException(
          'Una de las cuentas ya está vinculada a otro productor',
        );
      }
    }

    await tx.usuario.updateMany({
      where: {
        idProductor,
        ...(userIds.length > 0 ? { idUsuario: { notIn: userIds } } : {}),
      },
      data: { idProductor: null },
    });
    if (userIds.length > 0) {
      const assigned = await tx.usuario.updateMany({
        where: {
          idUsuario: { in: userIds },
          OR: [{ idProductor: null }, { idProductor }],
        },
        data: { idProductor },
      });
      if (assigned.count !== userIds.length) {
        throw new ConflictException(
          'Una de las cuentas fue vinculada a otro productor',
        );
      }
    }
  }

  private serialize(row: ProducerRow) {
    return {
      idProductor: row.idProductor.toString(),
      identificacion: row.identificacion,
      nombreRazonSocial: row.nombreRazonSocial,
      telefono: row.telefono,
      correo: row.correo,
      direccion: row.direccion,
      fechaActualizacion: row.fechaActualizacion,
      totalFincas: row._count.fincas,
      totalUsuarios: row._count.usuarios,
      usuarios: row.usuarios.map((user) => ({
        ...user,
        idUsuario: user.idUsuario.toString(),
      })),
    };
  }

  private parseId(value: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('Identificador de productor inválido');
    }
    const id = BigInt(value);
    if (id <= 0n) {
      throw new BadRequestException('Identificador de productor inválido');
    }
    return id;
  }

  private parseUserIds(values: Array<string | number>): bigint[] {
    if (!Array.isArray(values)) {
      throw new BadRequestException('Las cuentas vinculadas son inválidas');
    }
    const ids = values.map((value) => this.parsePositiveBigInt(value));
    return [...new Set(ids.map(String))].map(BigInt);
  }

  private parsePositiveBigInt(value: string | number): bigint {
    const normalized = String(value);
    if (!/^\d+$/.test(normalized)) {
      throw new BadRequestException('Cuenta de usuario inválida');
    }
    const id = BigInt(normalized);
    if (id <= 0n) throw new BadRequestException('Cuenta de usuario inválida');
    return id;
  }

  private async ensureExists(idProductor: bigint) {
    const row = await this.prisma.productor.findUnique({
      where: { idProductor },
      select: { idProductor: true },
    });
    if (!row) throw new NotFoundException('Productor no encontrado');
  }

  private async ensureIdNotTaken(identificacion: string) {
    const existing = await this.prisma.productor.findUnique({
      where: { identificacion },
      select: { idProductor: true },
    });
    if (existing) {
      throw new ConflictException('La identificación ya está registrada');
    }
  }

  private requireText(value: string, field: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException(`El campo ${field} es obligatorio`);
    }
    return normalized;
  }

  private validateEmail(value: string): void {
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Correo electrónico inválido');
    }
  }

  private rethrowKnownPrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('La identificación ya está registrada');
    }
    throw error;
  }
}
