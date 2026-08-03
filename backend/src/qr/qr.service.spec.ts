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

  it('rejects a non-numeric lot id', async () => {
    await expect(service.generar('abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException when the lot does not exist', async () => {
    prisma.loteProduccion.findUnique.mockResolvedValue(null);

    await expect(service.generar('8')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('builds a QR pointing to the public trace page with the lot code', async () => {
    prisma.loteProduccion.findUnique.mockResolvedValue({
      codigoLote: 'BAN-2026-001',
    });

    const result = await service.generar('8');

    expect(result).toEqual({
      url: 'https://app.bananotrace.test/trace/BAN-2026-001',
      qrDataUri: 'data:image/png;base64,fake',
      codigo: 'BAN-2026-001',
    });
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://app.bananotrace.test/trace/BAN-2026-001',
      { width: 600, margin: 2 }
    );
  });

  it('normalizes a trailing slash in FRONTEND_URL', async () => {
    prisma.loteProduccion.findUnique.mockResolvedValue({
      codigoLote: 'BAN-2026-001',
    });
    process.env.FRONTEND_URL = 'https://app.bananotrace.test/';

    const result = await service.generar('8');

    expect(result.url).toBe('https://app.bananotrace.test/trace/BAN-2026-001');
  });
});
