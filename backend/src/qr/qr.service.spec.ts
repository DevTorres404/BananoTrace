import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from './qr.service';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,fake'),
}));

describe('QrService', () => {
  let prisma: any;
  let service: QrService;
  const originalFrontendUrl = process.env.FRONTEND_URL;

  beforeEach(() => {
    prisma = { loteProduccion: { findUnique: jest.fn() } };
    service = new QrService(prisma as PrismaService);
    process.env.FRONTEND_URL = 'https://app.bananotrace.test';
  });

  afterEach(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
    jest.clearAllMocks();
  });

  it('rejects a tipo other than corporativo/publico', async () => {
    await expect(service.generar('8', 'otro')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a non-numeric lot id', async () => {
    await expect(service.generar('abc', 'publico')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException when the lot does not exist', async () => {
    prisma.loteProduccion.findUnique.mockResolvedValue(null);

    await expect(service.generar('8', 'publico')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('builds a public QR pointing to the consulta page with the lot code', async () => {
    prisma.loteProduccion.findUnique.mockResolvedValue({
      codigoLote: 'BAN-2026-001',
    });

    const result = await service.generar('8', 'publico');

    expect(result).toEqual({
      url: 'https://app.bananotrace.test/consulta?codigo=BAN-2026-001',
      qrDataUri: 'data:image/png;base64,fake',
      tipo: 'publico',
      codigo: 'BAN-2026-001',
    });
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://app.bananotrace.test/consulta?codigo=BAN-2026-001',
    );
  });

  it('builds a corporate QR pointing to the internal lot detail route', async () => {
    prisma.loteProduccion.findUnique.mockResolvedValue({
      codigoLote: 'BAN-2026-001',
    });

    const result = await service.generar('8', 'corporativo');

    expect(result.url).toBe('https://app.bananotrace.test/lotes/8');
  });
});
