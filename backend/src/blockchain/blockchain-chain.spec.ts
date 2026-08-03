import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import {
  canonicalJson,
  evaluarConfirmacion,
  registrarBloque,
  verificarBloques,
} from './blockchain-chain';

function sha256(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

describe('canonicalJson', () => {
  it('orders object keys deterministically regardless of insertion order', () => {
    const a = canonicalJson({ b: 1, a: 2, c: { z: 1, y: 2 } });
    const b = canonicalJson({ c: { y: 2, z: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":{"y":2,"z":1}}');
  });

  it('preserves array order', () => {
    expect(canonicalJson({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
  });
});

describe('registrarBloque', () => {
  function makeTransicion(idTransicion: bigint) {
    return {
      idTransicion,
      estadoAnterior: null,
      estadoNuevo: 'EN_PROCESO' as const,
      comentario: null,
      datosAdicionales: {},
      fechaTransicion: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  it('creates the genesis block with indice 0 and no previous hash', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = {
      registroBlockchain: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as Prisma.TransactionClient;

    await registrarBloque(tx, {
      idInstancia: 1n,
      transicion: makeTransicion(10n),
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.indice).toBe(0);
    expect(data.hashAnterior).toBeNull();
    expect(data.hashDatos).toMatch(/^[0-9a-f]{64}$/);
    expect(data.hashDatos).toBe(sha256(data.payloadCanonico));
  });

  it('chains the next block to the previous hashDatos and increments indice', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = {
      registroBlockchain: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ indice: 4, hashDatos: 'a'.repeat(64) }),
        create,
      },
    } as unknown as Prisma.TransactionClient;

    await registrarBloque(tx, {
      idInstancia: 1n,
      transicion: makeTransicion(11n),
    });

    const data = create.mock.calls[0][0].data;
    expect(data.indice).toBe(5);
    expect(data.hashAnterior).toBe('a'.repeat(64));
  });

  it('retries once after a P2002 collision and succeeds on the second attempt', async () => {
    const collision = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const create = jest.fn().mockRejectedValueOnce(collision).mockResolvedValueOnce({});
    const tx = {
      registroBlockchain: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      registrarBloque(tx, { idInstancia: 1n, transicion: makeTransicion(12n) }),
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('rethrows after a second consecutive P2002 collision', async () => {
    const collision = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const create = jest.fn().mockRejectedValue(collision);
    const tx = {
      registroBlockchain: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      registrarBloque(tx, { idInstancia: 1n, transicion: makeTransicion(13n) }),
    ).rejects.toBe(collision);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('verificarBloques', () => {
  function makeChain() {
    const genesisPayload = canonicalJson({ indice: 0 });
    const genesis = {
      indice: 0,
      payloadCanonico: genesisPayload,
      hashDatos: sha256(genesisPayload),
      hashAnterior: null,
    };
    const secondPayload = canonicalJson({ indice: 1 });
    const second = {
      indice: 1,
      payloadCanonico: secondPayload,
      hashDatos: sha256(secondPayload),
      hashAnterior: genesis.hashDatos,
    };
    return [genesis, second];
  }

  it('reports an intact chain as integra with no errors', () => {
    expect(verificarBloques(makeChain())).toEqual({ integra: true, errores: [] });
  });

  it('detects a tampered payload whose hash no longer matches', () => {
    const [genesis, second] = makeChain();
    const tampered = { ...second, payloadCanonico: canonicalJson({ indice: 'hacked' }) };

    const result = verificarBloques([genesis, tampered]);

    expect(result.integra).toBe(false);
    expect(result.errores).toEqual([
      expect.objectContaining({ indice: 1, motivo: expect.stringContaining('payload') }),
    ]);
  });

  it('detects a broken hashAnterior link', () => {
    const [genesis, second] = makeChain();
    const broken = { ...second, hashAnterior: 'f'.repeat(64) };

    const result = verificarBloques([genesis, broken]);

    expect(result.integra).toBe(false);
    expect(result.errores).toEqual([
      expect.objectContaining({ indice: 1, motivo: expect.stringContaining('hash anterior') }),
    ]);
  });

  it('detects a gap in the index sequence', () => {
    const [genesis, second] = makeChain();
    const gapped = { ...second, indice: 2 };

    const result = verificarBloques([genesis, gapped]);

    expect(result.integra).toBe(false);
    expect(result.errores.some((error) => error.motivo.includes('secuencia'))).toBe(true);
  });
});

describe('evaluarConfirmacion', () => {
  it('confirms a block whose hash and chain link are valid', () => {
    const payload = canonicalJson({ indice: 0 });
    const bloque = {
      indice: 0,
      payloadCanonico: payload,
      hashDatos: sha256(payload),
      hashAnterior: null,
    };

    expect(evaluarConfirmacion(bloque, null)).toEqual({
      estado: 'CONFIRMADO',
      motivo: null,
    });
  });

  it('marks a block as ERROR when the stored hash does not match the payload', () => {
    const bloque = {
      indice: 0,
      payloadCanonico: canonicalJson({ indice: 0 }),
      hashDatos: 'f'.repeat(64),
      hashAnterior: null,
    };

    const result = evaluarConfirmacion(bloque, null);

    expect(result.estado).toBe('ERROR');
    expect(result.motivo).toContain('payload');
  });
});
