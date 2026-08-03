import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    usuario: Record<string, jest.Mock>;
    rol: Record<string, jest.Mock>;
    rolMenu: Record<string, jest.Mock>;
    productor: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };

  const publicUser = {
    idUsuario: 7n,
    nombres: 'Ana',
    apellidos: 'Torres',
    correo: 'ana@coil.com',
    estado: true,
    fechaCreacion: new Date('2026-01-01T00:00:00Z'),
    fechaActualizacion: null,
    idProductor: null,
    productor: null,
    rol: { idRol: 2, nombre: 'SUPERVISOR_AGRICOLA', descripcion: null },
  };

  beforeEach(async () => {
    prisma = {
      usuario: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      rol: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      rolMenu: {
        findMany: jest.fn(),
      },
      productor: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((input: unknown) =>
        Array.isArray(input) ? Promise.all(input) : input,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(UsersService);
  });

  it('returns a paginated page of public users and never selects password hashes', async () => {
    prisma.usuario.findMany.mockResolvedValue([publicUser]);
    prisma.usuario.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result).toEqual({
      data: [{ ...publicUser, idUsuario: '7' }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    const findManyCalls = prisma.usuario.findMany.mock
      .calls as unknown as Array<[{ select: Record<string, boolean> }]>;
    const select = findManyCalls[0][0].select;
    expect(select.claveHash).toBeUndefined();
  });

  it('filters users by search term, role and status', async () => {
    prisma.usuario.findMany.mockResolvedValue([]);
    prisma.usuario.count.mockResolvedValue(0);

    await service.findAll({ search: 'ana', idRol: '2', estado: 'false' });

    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { nombres: { contains: 'ana', mode: 'insensitive' } },
                { apellidos: { contains: 'ana', mode: 'insensitive' } },
                { correo: { contains: 'ana', mode: 'insensitive' } },
              ],
            },
            { idRol: 2 },
            { estado: false },
          ],
        },
      }),
    );
  });

  it('normalizes role identifiers when updating a user', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 7n });
    prisma.rol.findUnique.mockResolvedValue({ idRol: 2 });
    prisma.usuario.update.mockResolvedValue(publicUser);

    await service.update('7', { idRol: '2', nombres: ' Ana ' });

    const updateCalls = prisma.usuario.update.mock.calls as unknown as Array<
      [
        {
          where: { idUsuario: bigint };
          data: Record<string, unknown>;
        },
      ]
    >;
    expect(updateCalls[0][0].where).toEqual({ idUsuario: 7n });
    expect(updateCalls[0][0].data).toEqual(
      expect.objectContaining({
        nombres: 'Ana',
        rol: { connect: { idRol: 2 } },
      }),
    );
  });

  it('builds the hierarchical navigation assigned to a role', async () => {
    prisma.rol.findUnique.mockResolvedValue({ idRol: 1 });
    prisma.rolMenu.findMany.mockResolvedValue([
      {
        menu: {
          idMenu: 5,
          idMenuPadre: null,
          etiqueta: 'Administración',
          icono: 'admin_panel_settings',
          orden: 5,
          estado: true,
          pantalla: null,
        },
      },
      {
        menu: {
          idMenu: 40,
          idMenuPadre: 5,
          etiqueta: 'Usuarios',
          icono: 'manage_accounts',
          orden: 1,
          estado: true,
          pantalla: { ruta: '/usuarios', estado: true },
        },
      },
    ]);

    await expect(service.getNavigation(1)).resolves.toEqual([
      {
        id: 5,
        label: 'Administración',
        icon: 'admin_panel_settings',
        route: null,
        children: [
          {
            id: 40,
            label: 'Usuarios',
            icon: 'manage_accounts',
            route: '/usuarios',
            children: [],
          },
        ],
      },
    ]);
  });

  it('prevents administrators from deactivating their own account', async () => {
    await expect(service.setStatus('7', false, '7')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('rejects producer links for accounts with another role', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      idUsuario: 7n,
      idRol: 5,
      idProductor: null,
    });

    await expect(
      service.update('7', { idProductor: '3' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productor.findUnique).not.toHaveBeenCalled();
  });

  it('rejects invalid identifiers instead of leaking a BigInt conversion error', async () => {
    await expect(service.findOne('invalid')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
