import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { ProducersService } from './producers.service';

describe('ProducersService', () => {
  let service: ProducersService;
  let prisma: {
    productor: Record<string, jest.Mock>;
    usuario: Record<string, jest.Mock>;
    finca: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };

  const producerRow = {
    idProductor: 5n,
    identificacion: '0912345678001',
    nombreRazonSocial: 'Productor BananoTrace',
    telefono: null,
    correo: 'productor@coil.com',
    direccion: null,
    fechaActualizacion: null,
    usuarios: [
      {
        idUsuario: 7n,
        nombres: 'Juan',
        apellidos: 'Pérez',
        correo: 'productor@coil.com',
        estado: true,
      },
    ],
    _count: { fincas: 2, usuarios: 1 },
  };

  beforeEach(() => {
    prisma = {
      productor: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      usuario: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      finca: { count: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    service = new ProducersService(prisma as unknown as PrismaService);
  });

  it('scopes a PRODUCTOR account to its linked business entity', async () => {
    prisma.productor.findMany.mockResolvedValue([producerRow]);

    const result = await service.findAll({
      idRol: ROLE_IDS.PRODUCTOR,
      idProductor: '5',
    });

    expect(prisma.productor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idProductor: 5n } }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        idProductor: '5',
        totalUsuarios: 1,
        usuarios: [expect.objectContaining({ idUsuario: '7' })],
      }),
    );
  });

  it('links only available PRODUCTOR accounts during an update', async () => {
    prisma.productor.findFirst.mockResolvedValue({ idProductor: 5n });
    prisma.usuario.findMany.mockResolvedValue([
      { idUsuario: 7n, idRol: ROLE_IDS.PRODUCTOR, idProductor: null },
    ]);
    prisma.usuario.updateMany.mockResolvedValue({ count: 1 });
    prisma.productor.findUniqueOrThrow.mockResolvedValue(producerRow);

    await service.update(
      '5',
      { idUsuarios: ['7'] },
      { idRol: ROLE_IDS.ADMINISTRADOR, idProductor: null },
    );

    expect(prisma.usuario.updateMany).toHaveBeenLastCalledWith({
      where: {
        idUsuario: { in: [7n] },
        OR: [{ idProductor: null }, { idProductor: 5n }],
      },
      data: { idProductor: 5n },
    });
  });

  it('rejects an account already linked to another producer', async () => {
    prisma.productor.findFirst.mockResolvedValue({ idProductor: 5n });
    prisma.usuario.findMany.mockResolvedValue([
      { idUsuario: 7n, idRol: ROLE_IDS.PRODUCTOR, idProductor: 9n },
    ]);

    await expect(
      service.update(
        '5',
        { idUsuarios: ['7'] },
        { idRol: ROLE_IDS.ADMINISTRADOR, idProductor: null },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
