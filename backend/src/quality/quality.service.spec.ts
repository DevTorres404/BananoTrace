import { PrismaService } from '../prisma/prisma.service';
import { QualityService } from './quality.service';

describe('QualityService', () => {
  it('returns active quality categories', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ codigo: 'PRIMERA', nombre: 'Primera' }]);
    const prisma = {
      categoriaCalidad: { findMany },
    } as unknown as PrismaService;
    const service = new QualityService(prisma);

    await expect(service.getCategories()).resolves.toEqual([
      { codigo: 'PRIMERA', nombre: 'Primera' },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true } }),
    );
  });
});
