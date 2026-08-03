import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticsService } from './logistics.service';

const blockchainStub = {
  crearBloque: jest.fn().mockResolvedValue(undefined),
} as unknown as BlockchainService;

describe('LogisticsService', () => {
  it('returns active catalog options', async () => {
    const prisma = {
      categoriaCalidad: {
        findMany: jest.fn().mockResolvedValue([{ codigo: 'PRIMERA' }]),
      },
      naviera: { findMany: jest.fn().mockResolvedValue([{ codigo: 'MSC' }]) },
      puerto: { findMany: jest.fn().mockResolvedValue([{ codigo: 'ECGYE' }]) },
      loteProduccion: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new LogisticsService(prisma, blockchainStub);

    await expect(
      service.options({ idRol: 1, sub: '1' } as never),
    ).resolves.toEqual({
      categoriasCalidad: [{ codigo: 'PRIMERA' }],
      navieras: [{ codigo: 'MSC' }],
      puertos: [{ codigo: 'ECGYE' }],
      lotes: [],
    });
  });

  it('filters shipments and returns the global operational summary', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    const prisma = {
      envio: { findMany, count },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    } as unknown as PrismaService;
    const service = new LogisticsService(prisma, blockchainStub);

    await expect(
      service.findAllEnvios({ search: 'Guayaquil', estado: 'EN_TRANSITO' }),
    ).resolves.toMatchObject({
      data: [],
      summary: { total: 5, planned: 2, loaded: 1, inTransit: 1, delivered: 1 },
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: 'EN_TRANSITO',
          OR: expect.arrayContaining([
            { codigoEnvio: { contains: 'Guayaquil', mode: 'insensitive' } },
            {
              puertoDestino: {
                paisNombre: { contains: 'Guayaquil', mode: 'insensitive' },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('registers a blockchain block for both transitions when advancing a package', async () => {
    const crearBloque = jest.fn().mockResolvedValue(undefined);
    const blockchain = { crearBloque } as unknown as BlockchainService;
    const link = {
      idInstancia: 12n,
      instancia: {
        idFlujo: 2,
        estado: 'EN_PROCESO',
        ejecuciones: [
          {
            idEjecucion: 20n,
            estado: 'EN_PROCESO',
            fase: {
              idFase: 5,
              codigo: 'DISPONIBLE',
              nombre: 'Disponible',
              idRolResponsable: 4,
            },
          },
        ],
      },
    };
    const prisma = {
      empaque: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ idUnidad: 40n })
          .mockResolvedValueOnce({
            idEmpaque: 100n,
            idUnidad: 40n,
            idEjecucion: 21n,
            idLote: 8n,
            idCategoriaCalidad: null,
            codigoCaja: 'CAJA-001',
            fechaEmpaque: new Date('2026-01-01T00:00:00.000Z'),
            pesoNetoKg: '18.50',
            codigoQr: 'QR-CAJA-001',
            estado: 'ASIGNADO',
            categoriaCalidadCat: null,
          }),
        update: jest.fn().mockResolvedValue({}),
      },
      flujoInstanciaUnidad: { findFirst: jest.fn().mockResolvedValue(link) },
      transicionFase: {
        findFirst: jest.fn().mockResolvedValue({
          faseDestino: { idFase: 6, codigo: 'ASIGNADO', idRolResponsable: 4 },
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      faseEjecucion: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ idEjecucion: 21n }),
      },
      transicionEjecucion: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ idTransicion: 501n })
          .mockResolvedValueOnce({ idTransicion: 502n }),
      },
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    } as unknown as PrismaService;
    const service = new LogisticsService(prisma, blockchain);

    await service.advanceEmpaque(
      '100',
      { comentario: 'Asignado' },
      { idRol: 4, sub: '1' } as never,
    );

    expect(crearBloque).toHaveBeenCalledTimes(2);
    expect(crearBloque).toHaveBeenNthCalledWith(1, prisma, {
      idInstancia: 12n,
      transicion: { idTransicion: 501n },
    });
    expect(crearBloque).toHaveBeenNthCalledWith(2, prisma, {
      idInstancia: 12n,
      transicion: { idTransicion: 502n },
    });
  });
});
