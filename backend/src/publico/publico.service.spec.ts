import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicoService } from './publico.service';

describe('PublicoService', () => {
  let prisma: any;
  let blockchainService: {
    verificarCadena: jest.Mock;
    verificarCadenaLigera: jest.Mock;
  };
  let service: PublicoService;

  beforeEach(() => {
    prisma = { unidadTrazable: { findFirst: jest.fn() } };
    blockchainService = { verificarCadena: jest.fn(), verificarCadenaLigera: jest.fn() };
    service = new PublicoService(
      prisma as PrismaService,
      blockchainService as unknown as BlockchainService,
    );
  });

  describe('consultarPorCodigo', () => {
    it('rejects an empty codigo before touching the database', async () => {
      await expect(service.consultarPorCodigo('  ')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.unidadTrazable.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no unit matches the code', async () => {
      prisma.unidadTrazable.findFirst.mockResolvedValue(null);

      await expect(service.consultarPorCodigo('BAN-2026-001')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('builds a public-safe summary for a lot, without exposing raw hashes or internal users', async () => {
      prisma.unidadTrazable.findFirst.mockResolvedValue({
        tipo: 'LOTE',
        codigo: 'BAN-2026-001',
        lote: {
          estado: 'COSECHADO',
          fechaSiembra: new Date('2026-01-15T00:00:00.000Z'),
          fechaCosecha: new Date('2026-03-01T00:00:00.000Z'),
          finca: { nombre: 'Finca Global', pais: 'Ecuador', region: 'El Oro' },
        },
        empaque: null,
        envio: null,
        instancias: [
          {
            idInstancia: 12n,
            instancia: {
              ejecuciones: [
                { estado: 'COMPLETADO', fechaInicio: new Date('2026-01-15T00:00:00.000Z'), fechaFin: new Date(), fase: { nombre: 'Producción' } },
                { estado: 'EN_PROCESO', fechaInicio: new Date('2026-03-01T00:00:00.000Z'), fechaFin: null, fase: { nombre: 'Control de calidad' } },
              ],
            },
          },
        ],
      });
      blockchainService.verificarCadenaLigera.mockResolvedValue({
        integra: true,
        bloques: 4,
        errores: [],
      });

      const result = await service.consultarPorCodigo('BAN-2026-001');

      expect(blockchainService.verificarCadenaLigera).toHaveBeenCalledWith(12n);
      expect(result).toEqual({
        tipo: 'LOTE',
        codigo: 'BAN-2026-001',
        estado: 'COSECHADO',
        finca: { nombre: 'Finca Global', pais: 'Ecuador', region: 'El Oro' },
        fechaSiembra: new Date('2026-01-15T00:00:00.000Z'),
        fechaCosecha: new Date('2026-03-01T00:00:00.000Z'),
        timeline: [
          { fase: 'Producción', fecha: new Date('2026-01-15T00:00:00.000Z'), estado: 'COMPLETADO' },
          { fase: 'Control de calidad', fecha: new Date('2026-03-01T00:00:00.000Z'), estado: 'EN_PROCESO' },
        ],
        integridadBlockchain: { verificable: true, integra: true, bloques: 4 },
      });
      expect(JSON.stringify(result)).not.toContain('hashDatos');
      expect(JSON.stringify(result)).not.toContain('payloadCanonico');
    });

    it('marks integridadBlockchain as not verifiable when the unit has no flow instance', async () => {
      prisma.unidadTrazable.findFirst.mockResolvedValue({
        tipo: 'EMPAQUE',
        codigo: 'QR-CAJA-001',
        lote: null,
        empaque: { estado: 'DISPONIBLE', fechaEmpaque: new Date() },
        envio: null,
        instancias: [],
      });

      const result = await service.consultarPorCodigo('QR-CAJA-001');

      expect(result.integridadBlockchain).toEqual({
        verificable: false,
        integra: null,
        bloques: 0,
      });
      expect(blockchainService.verificarCadenaLigera).not.toHaveBeenCalled();
    });
  });

  describe('verificacionResumen', () => {
    it('returns only integra/bloques, hiding hashes and error detail', async () => {
      blockchainService.verificarCadenaLigera.mockResolvedValue({
        integra: false,
        bloques: 3,
        errores: [{ indice: 1, motivo: 'alterado' }],
      });

      const result = await service.verificacionResumen('12');

      expect(result).toEqual({ verificable: true, integra: false, bloques: 3 });
    });

    it('rejects a non-numeric instance id', async () => {
      await expect(service.verificacionResumen('abc')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
