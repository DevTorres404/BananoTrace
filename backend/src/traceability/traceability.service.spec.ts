import { PrismaService } from '../prisma/prisma.service';
import { TraceabilityService } from './traceability.service';

describe('TraceabilityService', () => {
  it('returns active document types', async () => {
    const findMany = jest.fn().mockResolvedValue([{ codigo: 'CERTIFICADO' }]);
    const prisma = { tipoDocumento: { findMany } } as unknown as PrismaService;
    const service = new TraceabilityService(prisma);

    await expect(service.getDocumentTypes()).resolves.toEqual([
      { codigo: 'CERTIFICADO' },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true } }),
    );
  });
});
