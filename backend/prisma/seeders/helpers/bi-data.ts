/**
 * Deterministic generation helpers for realistic, non-linear BI seed data.
 *
 * Every function is driven by an explicit PRNG so the same seed always
 * reproduces the same "random" dataset. Nothing here is flat, constant or
 * repeated in obvious cycles.
 */

/** mulberry32 PRNG: deterministic, fast, good enough for seed data. */
export function crearPRNG(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomEntre(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function enteroEntre(rng: () => number, min: number, max: number): number {
  return Math.floor(randomEntre(rng, min, max + 1));
}

/** Approximate normal distribution (Box-Muller). */
export function normal(rng: () => number, media: number, desviacion: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return media + desviacion * z;
}

export function clip(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

export function redondear(valor: number, decimales = 2): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

/**
 * Monthly seasonal production factor (Jan=0..Dec=11).
 * Peaks Mar-Jun and Sep-Dec, valleys Jan-Feb and Jul-Aug.
 */
export const FACTOR_MENSUAL = [
  0.55, 0.65, 1.15, 1.2, 1.25, 1.15, 0.8, 0.7, 1.1, 1.2, 1.1, 0.85,
];

export function factorMes(mes: number): number {
  return FACTOR_MENSUAL[((mes % 12) + 12) % 12];
}

export function diasEnMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
}

/** Today at UTC midnight (avoids timezone drift in date math). */
export function hoy(): Date {
  const ahora = new Date();
  return new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()),
  );
}

export function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha.getTime());
  copia.setUTCDate(copia.getUTCDate() + dias);
  return copia;
}

export function restarDias(fecha: Date, dias: number): Date {
  return sumarDias(fecha, -dias);
}

/**
 * Picks a random date inside [inicio, fin] whose month follows the seasonal
 * production factor (months with more production are more likely). Partial
 * months at both ends of the window only use their valid days.
 */
export function fechaEnVentana(
  rng: () => number,
  inicio: Date,
  fin: Date,
  opciones: { conHora?: boolean } = {},
): Date {
  if (inicio.getTime() > fin.getTime()) {
    throw new Error(`Ventana de fecha inválida: ${inicio} > ${fin}`);
  }
  const conHora = opciones.conHora ?? true;

  const meses: Array<{ anio: number; mes: number }> = [];
  let cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
  const finCursor = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), 1));
  while (cursor.getTime() <= finCursor.getTime()) {
    meses.push({ anio: cursor.getUTCFullYear(), mes: cursor.getUTCMonth() });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  const pesos = meses.map(({ mes }) => factorMes(mes));
  const totalPeso = pesos.reduce((suma, peso) => suma + peso, 0);
  let restante = rng() * totalPeso;
  let indice = meses.length - 1;
  for (let i = 0; i < pesos.length; i++) {
    restante -= pesos[i];
    if (restante <= 0) {
      indice = i;
      break;
    }
  }

  const { anio, mes } = meses[indice];
  const esPrimerMes = indice === 0;
  const esUltimoMes = indice === meses.length - 1;
  const diaMin =
    esPrimerMes &&
    anio === inicio.getUTCFullYear() &&
    mes === inicio.getUTCMonth()
      ? inicio.getUTCDate()
      : 1;
  const diaMax =
    esUltimoMes && anio === fin.getUTCFullYear() && mes === fin.getUTCMonth()
      ? fin.getUTCDate()
      : diasEnMes(anio, mes);
  const dia = diaMin + Math.floor(rng() * (diaMax - diaMin + 1));

  const base = new Date(Date.UTC(anio, mes, dia));
  const tiempo = Math.min(
    fin.getTime(),
    Math.max(inicio.getTime(), base.getTime()),
  );
  const fecha = new Date(tiempo);
  if (conHora) {
    fecha.setUTCHours(Math.floor(rng() * 24), Math.floor(rng() * 60), 0, 0);
  } else {
    fecha.setUTCHours(0, 0, 0, 0);
  }
  return fecha;
}

/**
 * Banana crop cycle in days (siembra -> cosecha). Realistic range ~240-320,
 * slightly longer for lots planted during rainy months (Nov-May on the coast).
 */
export function cicloBanano(rng: () => number, mesSiembra: number): number {
  const base = Math.round(240 + rng() * 80);
  const lluvioso = mesSiembra >= 10 || mesSiembra <= 4;
  return base + (lluvioso ? Math.round(5 + rng() * 20) : 0);
}

/** Picks a year from a weighted map, e.g. { 2024: 0.35, 2025: 0.35, 2026: 0.3 }. */
export function elegirAnio(rng: () => number, pesosPorAnio: Record<number, number>): number {
  const anios = Object.keys(pesosPorAnio).map(Number);
  const total = anios.reduce((suma, anio) => suma + pesosPorAnio[anio], 0);
  let restante = rng() * total;
  for (const anio of anios) {
    restante -= pesosPorAnio[anio];
    if (restante <= 0) return anio;
  }
  return anios[anios.length - 1];
}

export function elegir<T>(rng: () => number, lista: T[]): T {
  return lista[Math.floor(rng() * lista.length)];
}

export function elegirPonderado<T>(
  rng: () => number,
  items: T[],
  peso: (item: T, index: number) => number,
): T {
  const pesos = items.map((item, i) => peso(item, i));
  const total = pesos.reduce((suma, pesoItem) => suma + pesoItem, 0);
  if (total <= 0) return items[items.length - 1];
  let restante = rng() * total;
  for (let i = 0; i < items.length; i++) {
    restante -= pesos[i];
    if (restante <= 0) return items[i];
  }
  return items[items.length - 1];
}
