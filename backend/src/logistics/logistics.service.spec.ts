import { PrismaService } from '../prisma/prisma.service';
import { LogisticsService } from './logistics.service';

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
    const service = new LogisticsService(prisma);

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
    const service = new LogisticsService(prisma);

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
});
