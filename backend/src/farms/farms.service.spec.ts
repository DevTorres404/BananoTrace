import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { PrismaService } from '../prisma/prisma.service';
import { FarmsService } from './farms.service';

describe('FarmsService', () => {
  let service: FarmsService;
  let prisma: {
    finca: Record<string, jest.Mock>;
    productor: Record<string, jest.Mock>;
    certificacion: Record<string, jest.Mock>;
  };

  const farmRow = {
    idFinca: 10n,
    idProductor: 5n,
    codigoFinca: 'FINCA-010',
    nombre: 'Finca Norte',
    pais: 'Ecuador',
    region: 'Los Ríos',
    localidad: 'Quevedo',
    sublocalidad: null,
    latitud: new Prisma.Decimal('-1.0223'),
    longitud: new Prisma.Decimal('-79.4604'),
    areaHectareas: new Prisma.Decimal('18.50'),
    estado: true,
    fechaActualizacion: new Date('2026-08-02T00:00:00.000Z'),
    productor: {
      idProductor: 5n,
      identificacion: '0912345678001',
      nombreRazonSocial: 'Productor BananoTrace',
    },
    _count: { lotes: 2, certificaciones: 1 },
  };

  const producerActor = {
    idRol: ROLE_IDS.PRODUCTOR,
    idProductor: '5',
  };
  const adminActor = {
    idRol: ROLE_IDS.ADMINISTRADOR,
    idProductor: null,
  };

  beforeEach(() => {
    prisma = {
      finca: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      productor: { findUnique: jest.fn() },
      certificacion: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new FarmsService(prisma as unknown as PrismaService);
  });

  it('scopes and filters the farm list for a PRODUCTOR account', async () => {
    prisma.finca.findMany.mockResolvedValue([farmRow]);

    const result = await service.findAll(
      { pais: 'Ecuador', region: 'Ríos', localidad: 'Quevedo', estado: 'true' },
      producerActor,
    );

    expect(prisma.finca.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { idProductor: 5n },
            { pais: { contains: 'Ecuador', mode: 'insensitive' } },
            { region: { contains: 'Ríos', mode: 'insensitive' } },
            { localidad: { contains: 'Quevedo', mode: 'insensitive' } },
            { estado: true },
          ]),
        },
      }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        idFinca: '10',
        areaHectareas: '18.5',
        lotesActivos: 2,
      }),
    );
  });

  it('prevents a PRODUCTOR account from creating a farm for another producer', async () => {
    await expect(
      service.create(
        {
          idProductor: '8',
          nombre: 'Finca Sur',
          pais: 'Ecuador',
          region: 'Guayas',
          localidad: 'Naranjal',
        },
        producerActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('builds the dashboard from active farms and active lot counts', async () => {
    prisma.finca.findMany.mockResolvedValue([
      farmRow,
      {
        ...farmRow,
        idFinca: 11n,
        codigoFinca: 'FINCA-011',
        _count: { lotes: 3, certificaciones: 2 },
      },
    ]);

    const result = await service.dashboard(adminActor);

    expect(result).toEqual(
      expect.objectContaining({
        totalFincasActivas: 2,
        totalLotesActivos: 5,
        totalCertificaciones: 3,
      }),
    );
  });

  it('validates certification dates against the persisted emission date', async () => {
    prisma.finca.findFirst.mockResolvedValue(farmRow);
    prisma.certificacion.findFirst.mockResolvedValue({
      idCertificacion: 20n,
      fechaEmision: new Date('2026-06-01T00:00:00.000Z'),
      fechaVencimiento: new Date('2027-06-01T00:00:00.000Z'),
    });

    await expect(
      service.updateCertification(
        '10',
        '20',
        { fechaVencimiento: '2026-05-01' },
        producerActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.certificacion.update).not.toHaveBeenCalled();
  });

  it('deactivates a farm instead of deleting its traceability history', async () => {
    prisma.finca.findFirst.mockResolvedValue(farmRow);
    prisma.finca.update.mockResolvedValue({ ...farmRow, estado: false });

    const result = await service.remove('10', producerActor);

    expect(prisma.finca.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idFinca: 10n },
        data: { estado: false },
      }),
    );
    expect(result.estado).toBe(false);
  });
});
