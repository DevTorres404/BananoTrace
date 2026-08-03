import { createHash } from 'crypto';
import { EstadoFlujo, Prisma } from '@prisma/client';

export interface TransitionForChain {
  idTransicion: bigint;
  estadoAnterior: EstadoFlujo | null;
  estadoNuevo: EstadoFlujo;
  comentario: string | null;
  datosAdicionales: Prisma.JsonValue;
  fechaTransicion: Date;
}

export interface ChainBlockRow {
  indice: number;
  hashDatos: string;
  hashAnterior: string | null;
  payloadCanonico: string;
}

export interface ChainError {
  indice: number;
  motivo: string;
}

/** Filas de vínculo (sin payload) usadas por la verificación ligera de encadenamiento. */
export interface ChainLinkRow {
  indice: number;
  hashDatos: string;
  hashAnterior: string | null;
}

/** Serializa `value` en JSON con las claves de cada objeto ordenadas alfabéticamente, para que el hash sea determinista sin importar el orden de inserción de las propiedades. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function buildPayload(
  indice: number,
  idInstancia: bigint,
  transicion: TransitionForChain,
  hashAnterior: string | null,
): string {
  return canonicalJson({
    indice,
    idInstancia: idInstancia.toString(),
    idTransicion: transicion.idTransicion.toString(),
    fecha: transicion.fechaTransicion.toISOString(),
    datos: transicion.datosAdicionales,
    hashAnterior,
  });
}

export function hashPayload(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Crea el bloque de la cadena para una transición recién insertada, dentro de la misma
 * transacción Prisma que la creó. Reintenta una vez si otra escritura concurrente ya tomó
 * el mismo índice (colisión P2002 en `[idInstancia, indice]`).
 */
export async function registrarBloque(
  tx: Prisma.TransactionClient,
  params: { idInstancia: bigint; transicion: TransitionForChain },
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ultimo = await tx.registroBlockchain.findFirst({
      where: { idInstancia: params.idInstancia },
      orderBy: { indice: 'desc' },
      select: { indice: true, hashDatos: true },
    });
    const indice = (ultimo?.indice ?? -1) + 1;
    const hashAnterior = ultimo?.hashDatos ?? null;
    const payloadCanonico = buildPayload(
      indice,
      params.idInstancia,
      params.transicion,
      hashAnterior,
    );
    const hashDatos = hashPayload(payloadCanonico);

    try {
      await tx.registroBlockchain.create({
        data: {
          idInstancia: params.idInstancia,
          idTransicion: params.transicion.idTransicion,
          indice,
          hashDatos,
          hashAnterior,
          payloadCanonico,
        },
      });
      return;
    } catch (error) {
      const isCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      if (!isCollision || attempt === 1) throw error;
    }
  }
}

/** Valida la secuencia, el encadenamiento de hashes y la integridad del payload de una cadena de bloques ya ordenada por índice ascendente. */
export function verificarBloques(bloques: ChainBlockRow[]): {
  integra: boolean;
  errores: ChainError[];
} {
  const errores: ChainError[] = [];
  let previous: ChainBlockRow | null = null;

  for (const [position, bloque] of bloques.entries()) {
    if (bloque.indice !== position) {
      errores.push({
        indice: bloque.indice,
        motivo: `Índice fuera de secuencia (esperado ${position})`,
      });
    }
    const expectedPrevious = previous?.hashDatos ?? null;
    if (bloque.hashAnterior !== expectedPrevious) {
      errores.push({
        indice: bloque.indice,
        motivo: 'El hash anterior no coincide con el bloque previo',
      });
    }
    if (hashPayload(bloque.payloadCanonico) !== bloque.hashDatos) {
      errores.push({
        indice: bloque.indice,
        motivo: 'El payload no coincide con el hash almacenado (posible alteración)',
      });
    }
    previous = bloque;
  }

  return { integra: errores.length === 0, errores };
}

/**
 * Valida la secuencia de índices y el encadenamiento de hashes usando solo las columnas
 * de vínculo (sin payloads). Es la verificación "ligera": detecta huecos, índices fuera
 * de secuencia y encadenamiento roto, pero no recomputa cada payload. El payload del
 * último bloque se verifica aparte para anclar la cadena.
 */
export function verificarEncadenamiento(bloques: ChainLinkRow[]): {
  integra: boolean;
  errores: ChainError[];
} {
  const errores: ChainError[] = [];
  let previous: ChainLinkRow | null = null;

  for (const [position, bloque] of bloques.entries()) {
    if (bloque.indice !== position) {
      errores.push({
        indice: bloque.indice,
        motivo: `Índice fuera de secuencia (esperado ${position})`,
      });
    }
    const expectedPrevious = previous?.hashDatos ?? null;
    if (bloque.hashAnterior !== expectedPrevious) {
      errores.push({
        indice: bloque.indice,
        motivo: 'El hash anterior no coincide con el bloque previo',
      });
    }
    previous = bloque;
  }

  return { integra: errores.length === 0, errores };
}

/** Evalúa un único bloque `PENDIENTE` contra su predecesor para decidir si pasa a CONFIRMADO o ERROR. */
export function evaluarConfirmacion(
  bloque: ChainBlockRow,
  anterior: ChainBlockRow | null,
): { estado: 'CONFIRMADO' | 'ERROR'; motivo: string | null } {
  const expectedPrevious = anterior?.hashDatos ?? null;
  if (bloque.hashAnterior !== expectedPrevious) {
    return {
      estado: 'ERROR',
      motivo: 'El hash anterior no coincide con el bloque previo',
    };
  }
  if (hashPayload(bloque.payloadCanonico) !== bloque.hashDatos) {
    return {
      estado: 'ERROR',
      motivo: 'El payload no coincide con el hash almacenado',
    };
  }
  return { estado: 'CONFIRMADO', motivo: null };
}
