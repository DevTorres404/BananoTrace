import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { PrismaService } from '../prisma/prisma.service';

const publicUserSelect = {
  idUsuario: true,
  nombres: true,
  apellidos: true,
  correo: true,
  idProductor: true,
  estado: true,
  fechaCreacion: true,
  fechaActualizacion: true,
  rol: {
    select: {
      idRol: true,
      nombre: true,
      descripcion: true,
    },
  },
  productor: {
    select: {
      idProductor: true,
      identificacion: true,
      nombreRazonSocial: true,
    },
  },
} satisfies Prisma.UsuarioSelect;

type PublicUser = Prisma.UsuarioGetPayload<{ select: typeof publicUserSelect }>;

export interface CreateUserInput {
  nombres: string;
  apellidos: string;
  correo: string;
  clave?: string;
  password?: string;
  idRol: number | string;
  idProductor?: number | string | null;
}

export interface UpdateUserInput {
  nombres?: string;
  apellidos?: string;
  correo?: string;
  clave?: string;
  password?: string;
  idRol?: number | string;
  idProductor?: number | string | null;
}

export interface NavigationItem {
  id: number;
  label: string;
  icon: string | null;
  route: string | null;
  children: NavigationItem[];
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.usuario.findUnique({
      where: { correo: this.normalizeEmail(email) },
      include: { rol: true },
    });
  }

  async create(data: CreateUserInput) {
    const nombres = this.requireText(data.nombres, 'nombres');
    const apellidos = this.requireText(data.apellidos, 'apellidos');
    const correo = this.normalizeEmail(data.correo);
    const idRol = this.parseRoleId(data.idRol);
    const idProductor = this.parseOptionalProducerId(data.idProductor);
    const password = data.clave ?? data.password;

    if (!password || password.length < 8) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres',
      );
    }

    await this.ensureRoleExists(idRol);
    await this.validateProducerLink(idRol, idProductor);

    const existingUser = await this.prisma.usuario.findUnique({
      where: { correo },
    });
    if (existingUser) {
      throw new ConflictException('El correo ya está registrado');
    }

    const claveHash = await bcrypt.hash(password, this.getSaltRounds());

    try {
      const user = await this.prisma.usuario.create({
        data: { nombres, apellidos, correo, claveHash, idRol, idProductor },
        select: publicUserSelect,
      });

      return this.serializeUser(user);
    } catch (error) {
      this.rethrowKnownPrismaError(error);
    }
  }

  async getRoles() {
    return this.prisma.rol.findMany({
      select: { idRol: true, nombre: true, descripcion: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async getNavigation(idRol: number): Promise<NavigationItem[]> {
    const role = await this.prisma.rol.findUnique({ where: { idRol } });
    if (!role) {
      throw new NotFoundException('El rol del usuario no existe');
    }

    const assignments = await this.prisma.rolMenu.findMany({
      where: { idRol },
      select: {
        menu: {
          select: {
            idMenu: true,
            idMenuPadre: true,
            etiqueta: true,
            icono: true,
            orden: true,
            estado: true,
            pantalla: {
              select: { ruta: true, estado: true },
            },
          },
        },
      },
    });

    const menus = assignments
      .map(({ menu }) => menu)
      .filter(
        (menu) => menu.estado && (!menu.pantalla || menu.pantalla.estado),
      );
    const assignedIds = new Set(menus.map((menu) => menu.idMenu));
    const childrenByParent = new Map<number | null, typeof menus>();

    for (const menu of menus) {
      const parentId =
        menu.idMenuPadre && assignedIds.has(menu.idMenuPadre)
          ? menu.idMenuPadre
          : null;
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(menu);
      childrenByParent.set(parentId, siblings);
    }

    const buildTree = (parentId: number | null): NavigationItem[] =>
      (childrenByParent.get(parentId) ?? [])
        .sort(
          (left, right) =>
            left.orden - right.orden || left.idMenu - right.idMenu,
        )
        .map((menu) => ({
          id: menu.idMenu,
          label: menu.etiqueta,
          icon: menu.icono,
          route: menu.pantalla?.ruta ?? null,
          children: buildTree(menu.idMenu),
        }));

    return buildTree(null);
  }

  async findAll() {
    const users = await this.prisma.usuario.findMany({
      select: publicUserSelect,
      orderBy: [{ estado: 'desc' }, { apellidos: 'asc' }, { nombres: 'asc' }],
    });

    return users.map((user) => this.serializeUser(user));
  }

  async findOne(id: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { idUsuario: this.parseUserId(id) },
      select: publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.serializeUser(user);
  }

  async update(id: string, data: UpdateUserInput) {
    const idUsuario = this.parseUserId(id);
    const currentUser = await this.prisma.usuario.findUnique({
      where: { idUsuario },
      select: { idUsuario: true, idRol: true, idProductor: true },
    });
    if (!currentUser) throw new NotFoundException('Usuario no encontrado');

    const updateData: Prisma.UsuarioUpdateInput = {};
    let resultingRoleId = currentUser.idRol;

    if (data.nombres !== undefined)
      updateData.nombres = this.requireText(data.nombres, 'nombres');
    if (data.apellidos !== undefined)
      updateData.apellidos = this.requireText(data.apellidos, 'apellidos');

    if (data.correo !== undefined) {
      const correo = this.normalizeEmail(data.correo);
      const duplicate = await this.prisma.usuario.findFirst({
        where: { correo, NOT: { idUsuario } },
        select: { idUsuario: true },
      });
      if (duplicate)
        throw new ConflictException('El correo ya está registrado');
      updateData.correo = correo;
    }

    if (data.idRol !== undefined) {
      const idRol = this.parseRoleId(data.idRol);
      await this.ensureRoleExists(idRol);
      updateData.rol = { connect: { idRol } };
      resultingRoleId = idRol;
    }

    const requestedProducerId =
      data.idProductor !== undefined
        ? this.parseOptionalProducerId(data.idProductor)
        : (currentUser.idProductor ?? null);
    if (data.idProductor !== undefined && requestedProducerId !== null) {
      await this.validateProducerLink(resultingRoleId, requestedProducerId);
    }
    const resultingProducerId =
      resultingRoleId === ROLE_IDS.PRODUCTOR ? requestedProducerId : null;

    await this.validateProducerLink(resultingRoleId, resultingProducerId);
    if (
      data.idProductor !== undefined ||
      resultingRoleId !== currentUser.idRol
    ) {
      updateData.productor = resultingProducerId
        ? { connect: { idProductor: resultingProducerId } }
        : { disconnect: true };
    }

    const password = data.clave ?? data.password;
    if (password !== undefined) {
      if (password.length < 8) {
        throw new BadRequestException(
          'La contraseña debe tener al menos 8 caracteres',
        );
      }
      updateData.claveHash = await bcrypt.hash(password, this.getSaltRounds());
    }

    try {
      const user = await this.prisma.usuario.update({
        where: { idUsuario },
        data: updateData,
        select: publicUserSelect,
      });
      return this.serializeUser(user);
    } catch (error) {
      this.rethrowKnownPrismaError(error);
    }
  }

  async setStatus(id: string, estado: boolean, actorId: string) {
    const idUsuario = this.parseUserId(id);
    const idActor = this.parseUserId(actorId);

    if (!estado && idUsuario === idActor) {
      throw new BadRequestException('No podés desactivar tu propio usuario');
    }

    await this.ensureUserExists(idUsuario);
    const user = await this.prisma.usuario.update({
      where: { idUsuario },
      data: { estado },
      select: publicUserSelect,
    });

    return this.serializeUser(user);
  }

  remove(id: string, actorId: string) {
    return this.setStatus(id, false, actorId);
  }

  private serializeUser(user: PublicUser) {
    return {
      ...user,
      idUsuario: user.idUsuario.toString(),
      idProductor: user.idProductor?.toString() ?? null,
      productor: user.productor
        ? {
            ...user.productor,
            idProductor: user.productor.idProductor.toString(),
          }
        : null,
    };
  }

  private async ensureUserExists(idUsuario: bigint) {
    const user = await this.prisma.usuario.findUnique({
      where: { idUsuario },
      select: { idUsuario: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
  }

  private async ensureRoleExists(idRol: number) {
    const role = await this.prisma.rol.findUnique({
      where: { idRol },
      select: { idRol: true },
    });
    if (!role) throw new BadRequestException('El rol seleccionado no existe');
  }

  private async validateProducerLink(
    idRol: number,
    idProductor: bigint | null,
  ): Promise<void> {
    if (idProductor !== null && idRol !== ROLE_IDS.PRODUCTOR) {
      throw new BadRequestException(
        'Solo un usuario con rol PRODUCTOR puede vincularse a un productor',
      );
    }
    if (idProductor === null) return;

    const producer = await this.prisma.productor.findUnique({
      where: { idProductor },
      select: { idProductor: true },
    });
    if (!producer) {
      throw new BadRequestException('El productor seleccionado no existe');
    }
  }

  private parseUserId(value: string): bigint {
    if (!/^\d+$/.test(value))
      throw new BadRequestException('Identificador de usuario inválido');
    const id = BigInt(value);
    if (id <= 0n)
      throw new BadRequestException('Identificador de usuario inválido');
    return id;
  }

  private parseRoleId(value: number | string): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0)
      throw new BadRequestException('Rol inválido');
    return id;
  }

  private parseOptionalProducerId(
    value: number | string | null | undefined,
  ): bigint | null {
    if (value === undefined || value === null || value === '') return null;
    const normalized = String(value);
    if (!/^\d+$/.test(normalized)) {
      throw new BadRequestException('Productor inválido');
    }
    const id = BigInt(normalized);
    if (id <= 0n) throw new BadRequestException('Productor inválido');
    return id;
  }

  private normalizeEmail(value: string): string {
    const email = value?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Correo electrónico inválido');
    }
    return email;
  }

  private requireText(value: string, field: string): string {
    const normalized = value?.trim();
    if (!normalized)
      throw new BadRequestException(`El campo ${field} es obligatorio`);
    return normalized;
  }

  private getSaltRounds(): number {
    const configured = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);
    return Number.isInteger(configured) && configured >= 8 ? configured : 10;
  }

  private rethrowKnownPrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('El correo ya está registrado');
    }
    throw error;
  }
}
