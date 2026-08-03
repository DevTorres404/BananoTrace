import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalJson } from './blockchain-chain';
import { BlockchainService } from './blockchain.service';

function sha256(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

describe('BlockchainService', () => {
  let prisma: any;
  let service: BlockchainService;

  beforeEach(() => {
    prisma = {
      registroBlockchain: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new BlockchainService(prisma as PrismaService);
  });

  describe('crearBloque', () => {
    it('creates a genesis block for a new instance inside the given transaction', async () => {
      const tx = {
        registroBlockchain: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
        },
      };

      await service.crearBloque(tx as any, {
        idInstancia: 1n,
        transicion: {
          idTransicion: 10n,
          estadoAnterior: null,
          estadoNuevo: 'EN_PROCESO' as const,
          comentario: null,
          datosAdicionales: {},
          fechaTransicion: new Date('2026-01-01T00:00:00.000Z'),
        },
      });

      expect(tx.registroBlockchain.create).toHaveBeenCalledTimes(1);
    });

    it('wraps an unrecoverable chain error as a ConflictException', async () => {
      const tx = {
        registroBlockchain: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockRejectedValue(new Error('boom')),
        },
      };

      await expect(
        service.crearBloque(tx as any, {
          idInstancia: 1n,
          transicion: {
            idTransicion: 10n,
            estadoAnterior: null,
            estadoNuevo: 'EN_PROCESO' as const,
            comentario: null,
            datosAdicionales: {},
            fechaTransicion: new Date(),
          },
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('verificarCadena', () => {
    it('returns integra:true for a healthy chain read in index order', async () => {
      const genesisPayload = canonicalJson({ indice: 0 });
      prisma.registroBlockchain.findMany.mockResolvedValue([
        {
          indice: 0,
          hashDatos: sha256(genesisPayload),
          hashAnterior: null,
          payloadCanonico: genesisPayload,
        },
      ]);

      const result = await service.verificarCadena(5n);

      expect(prisma.registroBlockchain.findMany).toHaveBeenCalledWith({
        where: { idInstancia: 5n },
        orderBy: { indice: 'asc' },
        select: {
          indice: true,
          hashDatos: true,
          hashAnterior: true,
          payloadCanonico: true,
        },
      });
      expect(result).toEqual({ integra: true, bloques: 1, errores: [] });
    });

    it('returns integra:false with the offending index when a block was tampered with', async () => {
      const genesisPayload = canonicalJson({ indice: 0 });
      prisma.registroBlockchain.findMany.mockResolvedValue([
        {
          indice: 0,
          hashDatos: sha256(genesisPayload),
          hashAnterior: null,
          payloadCanonico: canonicalJson({ indice: 'tampered' }),
        },
      ]);

      const result = await service.verificarCadena(5n);

      expect(result.integra).toBe(false);
      expect(result.errores).toEqual([expect.objectContaining({ indice: 0 })]);
    });
  });

  describe('verificarCadenaLigera', () => {
    it('returns integra:true for a healthy linked chain without loading payloads', async () => {
      prisma.registroBlockchain.findMany.mockResolvedValue([
        { indice: 0, hashDatos: 'a'.repeat(64), hashAnterior: null },
        { indice: 1, hashDatos: 'b'.repeat(64), hashAnterior: 'a'.repeat(64) },
      ]);
      prisma.registroBlockchain.findFirst.mockResolvedValue({
        indice: 1,
        hashDatos: sha256(canonicalJson({ indice: 1 })),
        payloadCanonico: canonicalJson({ indice: 1 }),
      });

      const result = await service.verificarCadenaLigera(5n);

      expect(prisma.registroBlockchain.findMany).toHaveBeenCalledWith({
        where: { idInstancia: 5n },
        orderBy: { indice: 'asc' },
        select: { indice: true, hashDatos: true, hashAnterior: true },
      });
      expect(prisma.registroBlockchain.findFirst).toHaveBeenCalledWith({
        where: { idInstancia: 5n },
        orderBy: { indice: 'desc' },
        select: { indice: true, hashDatos: true, payloadCanonico: true },
      });
      expect(result).toEqual({ integra: true, bloques: 2, errores: [] });
    });

    it('detects a broken link and a tampered last payload', async () => {
      prisma.registroBlockchain.findMany.mockResolvedValue([
        { indice: 0, hashDatos: 'a'.repeat(64), hashAnterior: null },
        { indice: 1, hashDatos: 'b'.repeat(64), hashAnterior: 'x'.repeat(64) },
      ]);
      prisma.registroBlockchain.findFirst.mockResolvedValue({
        indice: 1,
        hashDatos: sha256(canonicalJson({ indice: 1 })),
        payloadCanonico: canonicalJson({ indice: 'tampered' }),
      });

      const result = await service.verificarCadenaLigera(5n);

      expect(result.integra).toBe(false);
      expect(result.errores.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('confirmarPendientes', () => {
    it('confirms a valid pending genesis block', async () => {
      const payload = canonicalJson({ indice: 0 });
      prisma.registroBlockchain.findMany.mockResolvedValue([
        {
          idRegistroBlockchain: 1n,
          idInstancia: 5n,
          indice: 0,
          hashDatos: sha256(payload),
          hashAnterior: null,
          payloadCanonico: payload,
        },
      ]);

      const result = await service.confirmarPendientes();

      expect(prisma.registroBlockchain.update).toHaveBeenCalledWith({
        where: { idRegistroBlockchain: 1n },
        data: { estadoConfirmacion: 'CONFIRMADO' },
      });
      expect(result).toEqual({ confirmados: 1, errores: 0 });
    });

    it('marks a block as ERROR and looks up its predecessor by index when not genesis', async () => {
      const payload = canonicalJson({ indice: 1 });
      prisma.registroBlockchain.findMany.mockResolvedValue([
        {
          idRegistroBlockchain: 2n,
          idInstancia: 5n,
          indice: 1,
          hashDatos: sha256(payload),
          hashAnterior: 'f'.repeat(64),
          payloadCanonico: payload,
        },
      ]);
      prisma.registroBlockchain.findUnique.mockResolvedValue({
        indice: 0,
        hashDatos: 'a'.repeat(64),
        hashAnterior: null,
        payloadCanonico: canonicalJson({ indice: 0 }),
      });

      const result = await service.confirmarPendientes();

      expect(prisma.registroBlockchain.findUnique).toHaveBeenCalledWith({
        where: { idInstancia_indice: { idInstancia: 5n, indice: 0 } },
        select: {
          indice: true,
          hashDatos: true,
          hashAnterior: true,
          payloadCanonico: true,
        },
      });
      expect(prisma.registroBlockchain.update).toHaveBeenCalledWith({
        where: { idRegistroBlockchain: 2n },
        data: { estadoConfirmacion: 'ERROR' },
      });
      expect(result).toEqual({ confirmados: 0, errores: 1 });
    });
  });
});
