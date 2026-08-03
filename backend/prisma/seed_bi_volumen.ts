import {
  EstadoEmpaque,
  EstadoEnvio,
  EstadoFlujo,
  EstadoLote,
  Prisma,
  PrismaClient,
  ResultadoControl,
  RolUnidadFlujo,
  TipoUnidadTrazable,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import { ROLE_IDS } from '../src/auth/domain/role.constants';
import { canonicalJson, hashPayload } from '../src/blockchain/blockchain-chain';
import {
  crearPRNG,
  randomEntre,
  enteroEntre,
  normal,
  clip,
  redondear,
  factorMes,
  sumarDias,
  restarDias,
  fechaEnVentana,
  cicloBanano,
  elegirAnio,
  elegir,
  elegirPonderado,
  hoy,
} from './seeders/helpers/bi-data';

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Targets and tuning constants (deterministic, additive, non-linear dataset).
// ---------------------------------------------------------------------------
const PREFIJO_PRODUCTOR = '09BIG';
const OBJETIVO_PRODUCTORES = 200;
const OBJETIVO_FINCAS = 500;
const OBJETIVO_LOTES = 10_000;
const BASE_SERIAL = 100_000;
const CHUNK_LOTES = 100;
const CHUNK_INSERT = 1_500;

const PROB_RETRY_CALIDAD = 0.7;
const PROB_RETRY_CALIDAD_3 = 0.35;
const PROB_RETRY_EMPAQUE = 0.3;
const PROB_RETRY_LOGISTICA = 0.3;
const PROB_RETRY_ENVIO_FLOW = 0.4;
const PROB_ENVIO_EMPACADO = 0.55;

const PESOS_ANIO = { 2023: 0.15, 2024: 0.25, 2025: 0.3, 2026: 0.3 } as const;

// ---------------------------------------------------------------------------
// Plan row types (mutable id slots filled after bulk insert + read-back).
// ---------------------------------------------------------------------------
interface UnidadPlan {
  tipo: TipoUnidadTrazable;
  codigo: string;
  fechaRegistro: Date;
  id?: bigint;
}

interface InstanciaPlan {
  codigo: string;
  idFlujo: number;
  estado: EstadoFlujo;
  fechaInicio: Date;
  fechaRegistro: Date;
  id?: bigint;
}

interface EjecucionPlan {
  instancia: InstanciaPlan;
  idFase: number;
  idResponsable: bigint | null;
  numeroIntento: number;
  estado: EstadoFlujo;
  datosAdicionales: Prisma.InputJsonValue;
  fechaInicio: Date;
  fechaFin: Date | null;
  fechaRegistro: Date;
  id?: bigint;
}

interface TransicionPlan {
  instancia: InstanciaPlan;
  ejecucion: EjecucionPlan;
  estadoAnterior: EstadoFlujo | null;
  estadoNuevo: EstadoFlujo;
  idUsuario: bigint;
  comentario: string;
  datosAdicionales: Prisma.InputJsonValue;
  fechaTransicion: Date;
  id?: bigint;
}

interface EventoPlan {
  unidad: UnidadPlan;
  ejecucion: EjecucionPlan;
  idTipoEvento: number;
  idUsuario: bigint;
  fechaEvento: Date;
  ubicacion: string;
  descripcion: string;
  datosAdicionales: Prisma.InputJsonValue;
  fechaRegistro: Date;
  id?: bigint;
}

interface ControlPlan {
  ejecucion: EjecucionPlan;
  idUsuario: bigint;
  idCategoriaCalidad: number | null;
  fechaControl: Date;
  calibreMm: number;
  pesoMuestraKg: number;
  porcentajeRechazo: number;
  resultado: ResultadoControl;
  observaciones: string | null;
}

interface DocumentoPlan {
  idTipoDocumento: number;
  nombre: string;
  url: string;
  fechaCarga: Date;
}

interface CajaPlan {
  unidad: UnidadPlan;
  instancia: InstanciaPlan;
  ejecuciones: EjecucionPlan[];
  transiciones: TransicionPlan[];
  empaqueEjecucion: EjecucionPlan;
  empaqueDatos: {
    idCategoriaCalidad: number | null;
    codigoCaja: string;
    fechaEmpaque: Date;
    pesoNetoKg: number;
    estado: EstadoEmpaque;
  };
  idEmpaque?: bigint;
  eventos: EventoPlan[];
}

interface EnvioPlan {
  unidad: UnidadPlan;
  instancia: InstanciaPlan;
  ejecuciones: EjecucionPlan[];
  transiciones: TransicionPlan[];
  logisticaEjecucion: EjecucionPlan;
  envioDatos: {
    idNaviera: number | null;
    idPuertoOrigen: number;
    idPuertoDestino: number;
    codigoEnvio: string;
    numeroContenedor: string;
    fechaSalida: Date;
    fechaEstimadaLlegada: Date;
    temperaturaSalida: number;
    estado: EstadoEnvio;
  };
  idEnvio?: bigint;
  cajas: CajaPlan[];
  eventos: EventoPlan[];
}

interface LoteDatos {
  idFinca: bigint;
  idVariedad: number | null;
  codigoLote: string;
  fechaSiembra: Date;
  fechaEstimadaCosecha: Date;
  fechaCosecha: Date | null;
  cantidadPlantas: number;
  pesoCosechadoKg: number | null;
  estado: EstadoLote;
  fechaRegistro: Date;
}

interface LotePlan {
  unidad: UnidadPlan;
  lote: LoteDatos;
  idLote?: bigint;
  instancia: InstanciaPlan | null;
  ejecuciones: EjecucionPlan[];
  transiciones: TransicionPlan[];
  controles: ControlPlan[];
  cajas: CajaPlan[];
  envio: EnvioPlan | null;
  eventosLote: EventoPlan[];
  eventoExportacion: EventoPlan | null;
  documentos: DocumentoPlan[];
}

interface PasoPlan {
  idFase: number;
  numeroIntento: number;
  idResponsable: bigint | null;
  estadoFinal: EstadoFlujo;
  fechaInicio: Date;
  fechaFin: Date | null;
  datosAdicionales: Prisma.InputJsonValue;
}

interface PlanContext {
  idFlujoPrincipal: number;
  fasesMain: Record<'PRODUCCION' | 'CALIDAD' | 'EMPAQUE' | 'LOGISTICA', number>;
  idFlujoEmpaque: number;
  fasesEmpaque: Record<'DISPONIBLE' | 'ASIGNADO' | 'EN_TRANSITO' | 'ENTREGADO', number>;
  idFlujoEnvio: number;
  fasesEnvio: Record<'PLANIFICADO' | 'CARGADO' | 'EN_TRANSITO' | 'ENTREGADO', number>;
  variedades: number[];
  categorias: number[];
  navieras: number[];
  puertosOrigen: number[];
  puertosDestino: number[];
  tiposEvento: Map<string, number>;
  tiposDocumento: Map<string, number>;
  fincas: Array<{ idFinca: bigint; areaHectareas: number; nombre: string }>;
  supervisores: bigint[];
  gerentes: bigint[];
  calidad: bigint[];
  logistica: bigint[];
}

interface Cronograma {
  fechaSiembra: Date;
  fechaEstimadaCosecha: Date;
  fechaCosecha: Date | null;
  fechaControl: Date | null;
  fechaEmpaque: Date | null;
  fechaSalida: Date | null;
  fechaCargado: Date | null;
  fechaTransito: Date | null;
  fechaEntrega: Date | null;
}

type Etapa =
  | 'PLANIFICADO'
  | 'EN_PRODUCCION'
  | 'COSECHADO'
  | 'CALIDAD'
  | 'CALIDAD_RECHAZADO'
  | 'EMPACADO'
  | 'EXPORTADO'
  | 'CERRADO';

const DISTRIBUCION_ETAPAS: Array<{ etapa: Etapa; cantidad: number }> = [
  { etapa: 'PLANIFICADO', cantidad: 300 },
  { etapa: 'EN_PRODUCCION', cantidad: 1000 },
  { etapa: 'COSECHADO', cantidad: 1000 },
  { etapa: 'CALIDAD', cantidad: 600 },
  { etapa: 'CALIDAD_RECHAZADO', cantidad: 1400 },
  { etapa: 'EMPACADO', cantidad: 1700 },
  { etapa: 'EXPORTADO', cantidad: 3000 },
  { etapa: 'CERRADO', cantidad: 1000 },
];

const OBSERVACIONES: Record<ResultadoControl, string[]> = {
  APROBADO: [
    'Fruta en óptimas condiciones para exportación',
    'Cumple con los parámetros de grado y calibre solicitados',
    'Sin hallazgos relevantes en la inspección',
    'Calidad uniforme en la muestra analizada',
  ],
  OBSERVADO: [
    'Se detectaron manchas leves en un porcentaje de la muestra',
    'Presencia de dedos cortos en algunos racimos',
    'Ligera deshidratación del pedúnculo, dentro de tolerancia',
    'Se solicita reforzar el proceso de selección en planta',
  ],
  RECHAZADO: [
    'Lote rechazado por daños mecánicos y fruta sobremadura',
    'Presencia de plagas y fruta con golpes de manipulación',
    'Porcentaje de rechazo fuera del rango admisible para exportación',
    'Lote no apto por desorden fisiológico en la fruta',
  ],
};

// ---------------------------------------------------------------------------
// Code counters (explicit high serials: PREFIJO-AÑO-NNNNNN, base 100001).
// ---------------------------------------------------------------------------
class ContadorCodigo {
  private ultimo = new Map<string, number>();

  siguiente(prefijo: string, anio: number): string {
    const clave = `${prefijo}-${anio}`;
    const ultimo = (this.ultimo.get(clave) ?? BASE_SERIAL) + 1;
    this.ultimo.set(clave, ultimo);
    return `${prefijo}-${anio}-${String(ultimo).padStart(6, '0')}`;
  }

  maximo(prefijo: string, anio: number): number {
    return this.ultimo.get(`${prefijo}-${anio}`) ?? 0;
  }
}

const correlativos: Record<'FINCA' | 'LOTE' | 'EMPAQUE' | 'ENVIO', ContadorCodigo> = {
  FINCA: new ContadorCodigo(),
  LOTE: new ContadorCodigo(),
  EMPAQUE: new ContadorCodigo(),
  ENVIO: new ContadorCodigo(),
};

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------
function conHoraLaboral(rng: () => number, fecha: Date): Date {
  const copia = new Date(fecha.getTime());
  copia.setUTCHours(enteroEntre(rng, 6, 20), enteroEntre(rng, 0, 59), 0, 0);
  return copia;
}

function numeroContenedor(rng: () => number, anio: number): string {
  return `CONT-${anio}-${String(enteroEntre(rng, 1000, 9999)).padStart(4, '0')}`;
}

// Replica of the private buildPayload in src/blockchain/blockchain-chain.ts.
function buildBlockPayload(
  indice: number,
  idInstancia: bigint,
  transicion: {
    idTransicion: bigint;
    fechaTransicion: Date;
    datosAdicionales: Prisma.JsonValue;
  },
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

function observar(rng: () => number, resultado: ResultadoControl): string | null {
  if (resultado === ResultadoControl.APROBADO && rng() < 0.6) return null;
  return elegir(rng, OBSERVACIONES[resultado]);
}

// ---------------------------------------------------------------------------
// Data distributions (non-linear: trend + seasonality + outliers + noise).
// ---------------------------------------------------------------------------
function cantidadPlantasLote(rng: () => number, areaHectareas: number): number {
  const densidad = (1800 + rng() * 600) * (0.9 + rng() * 0.2);
  const fraccionLote = randomEntre(rng, 0.08, 0.35);
  let plantas = Math.round(areaHectareas * densidad * fraccionLote);
  if (plantas < 800) plantas = Math.round(800 + rng() * 400);
  if (plantas > 3200 && areaHectareas < 60) {
    plantas = Math.round(800 + Math.pow(rng(), 2) * 2400);
  }
  return plantas < 1 ? 800 : plantas;
}

function pesoCosechadoLote(
  rng: () => number,
  cantidadPlantas: number,
  fechaCosecha: Date,
): number {
  const anio = fechaCosecha.getUTCFullYear();
  const mes = fechaCosecha.getUTCMonth();
  let factor = clip(normal(rng, 22, 3), 13, 32);
  factor *= 1 + 0.06 * (anio - 2024);
  factor *= 1 + (factorMes(mes) - 1) * 0.3;
  const roll = rng();
  if (roll < 0.015) {
    factor = randomEntre(rng, 14, 16);
  } else if (roll > 0.985) {
    factor = randomEntre(rng, 28, 30);
  }
  factor = clip(factor, 13, 34);
  return redondear(cantidadPlantas * factor, 2);
}

function calibreLote(rng: () => number): number {
  let calibre = clip(normal(rng, 39.5, 2.2), 32, 46);
  const roll = rng();
  if (roll < 0.015) {
    calibre = randomEntre(rng, 28, 31.5);
  } else if (roll > 0.985) {
    calibre = randomEntre(rng, 45.5, 47.5);
  }
  return redondear(calibre, 2);
}

function pesoMuestraLote(rng: () => number): number {
  return redondear(clip(normal(rng, 20, 2), 15, 25), 2);
}

function porcentajeRechazoLote(
  rng: () => number,
  resultado: ResultadoControl,
  mesControl: number,
): number {
  const mesDesfavorable = (mesControl >= 1 && mesControl <= 4) || mesControl === 6 || mesControl === 7;
  if (resultado === ResultadoControl.RECHAZADO) {
    return redondear(randomEntre(rng, 10, 25), 2);
  }
  if (resultado === ResultadoControl.OBSERVADO) {
    return redondear(
      mesDesfavorable ? randomEntre(rng, 8, 10) : randomEntre(rng, 5, 10),
      2,
    );
  }
  return redondear(
    clip(normal(rng, 2.2, 1.2) * (mesDesfavorable ? 1.5 : 1), 0.3, 5),
    2,
  );
}

function pesoNetoCaja(rng: () => number): number {
  let peso = clip(normal(rng, 18.14, 0.45), 17.0, 19.8);
  if (rng() < 0.03) peso = randomEntre(rng, 17.0, 17.3);
  return redondear(peso, 2);
}

function temperaturaSalidaEnvio(rng: () => number, mesSalida: number): number {
  const estacional = 0.6 * Math.sin((2 * Math.PI * (mesSalida - 2)) / 12);
  let temperatura = 13.2 + estacional + normal(rng, 0, 0.35);
  temperatura = clip(temperatura, 12.2, 14.8);
  if (rng() < 0.02) temperatura = randomEntre(rng, 15.0, 15.8);
  return redondear(temperatura, 2);
}

// ---------------------------------------------------------------------------
// Cronograma (siembra <= estimada <= cosecha, plus post-harvest chain).
// ---------------------------------------------------------------------------
function cronogramaEtapa(rng: () => number, etapa: Etapa): Cronograma {
  const ahora = hoy();
  const base: Cronograma = {
    fechaSiembra: ahora,
    fechaEstimadaCosecha: ahora,
    fechaCosecha: null,
    fechaControl: null,
    fechaEmpaque: null,
    fechaSalida: null,
    fechaCargado: null,
    fechaTransito: null,
    fechaEntrega: null,
  };

  if (etapa === 'PLANIFICADO') {
    const fechaSiembra = sumarDias(ahora, enteroEntre(rng, 0, 90));
    const ciclo = cicloBanano(rng, fechaSiembra.getUTCMonth());
    base.fechaSiembra = fechaSiembra;
    base.fechaEstimadaCosecha = restarDias(sumarDias(fechaSiembra, ciclo), enteroEntre(rng, 20, 40));
    return base;
  }

  if (etapa === 'EN_PRODUCCION') {
    const fechaSiembra = restarDias(ahora, enteroEntre(rng, 30, 250));
    const ciclo = cicloBanano(rng, fechaSiembra.getUTCMonth());
    base.fechaSiembra = fechaSiembra;
    base.fechaEstimadaCosecha = restarDias(sumarDias(fechaSiembra, ciclo), enteroEntre(rng, 20, 40));
    return base;
  }

  const anio = elegirAnio(rng, PESOS_ANIO);
  const fin =
    anio >= 2026
      ? restarDias(ahora, etapa === 'CERRADO' ? 60 : 25)
      : new Date(Date.UTC(anio, 11, 31));
  const fechaCosecha = fechaEnVentana(rng, new Date(Date.UTC(anio, 0, 1)), fin, { conHora: false });
  const mesSiembraAprox = (fechaCosecha.getUTCMonth() + 12 - 10) % 12;
  const ciclo = cicloBanano(rng, mesSiembraAprox);
  const fechaSiembra = restarDias(fechaCosecha, ciclo);
  const fechaEstimadaCosecha = restarDias(fechaCosecha, enteroEntre(rng, 20, 40));
  const fechaControl = sumarDias(fechaCosecha, enteroEntre(rng, 1, 4));
  const fechaEmpaque = sumarDias(fechaControl, enteroEntre(rng, 1, 3));
  const fechaSalida = sumarDias(fechaEmpaque, enteroEntre(rng, 1, 5));
  const fechaCargado = sumarDias(fechaSalida, enteroEntre(rng, 0, 2));
  const fechaTransito = sumarDias(fechaCargado, enteroEntre(rng, 1, 3));
  const fechaEntrega = sumarDias(fechaTransito, enteroEntre(rng, 8, 22));
  return {
    fechaSiembra,
    fechaEstimadaCosecha,
    fechaCosecha,
    fechaControl,
    fechaEmpaque,
    fechaSalida,
    fechaCargado,
    fechaTransito,
    fechaEntrega,
  };
}

// ---------------------------------------------------------------------------
// Flow step generation (phase attempts + state transitions).
// ---------------------------------------------------------------------------
function intentosFase(
  rng: () => number,
  params: {
    idFase: number;
    idResponsable: bigint | null;
    fechaInicio: Date;
    fechaFin: Date | null;
    estadoFinal: EstadoFlujo;
    probRetry: number;
    probRetryExtra: number;
    datos: Prisma.InputJsonValue;
  },
): PasoPlan[] {
  const n =
    1 +
    (rng() < params.probRetry ? 1 : 0) +
    (rng() < params.probRetryExtra ? 1 : 0);
  const pasos: PasoPlan[] = [];
  for (let k = 1; k <= n; k++) {
    const ultimo = k === n;
    pasos.push({
      idFase: params.idFase,
      numeroIntento: k,
      idResponsable: params.idResponsable,
      estadoFinal: ultimo ? params.estadoFinal : EstadoFlujo.RECHAZADO,
      fechaInicio: sumarDias(params.fechaInicio, k - 1),
      fechaFin:
        ultimo && params.estadoFinal === EstadoFlujo.EN_PROCESO
          ? null
          : params.fechaFin
            ? sumarDias(params.fechaFin, k - 1)
            : null,
      datosAdicionales: params.datos,
    });
  }
  return pasos;
}

function estadoFinalCalidad(etapa: Etapa): EstadoFlujo {
  if (etapa === 'CALIDAD' || etapa === 'COSECHADO') return EstadoFlujo.EN_PROCESO;
  if (etapa === 'CALIDAD_RECHAZADO') return EstadoFlujo.RECHAZADO;
  return EstadoFlujo.COMPLETADO;
}

function pasosEtapa(
  rng: () => number,
  ctx: PlanContext,
  etapa: Etapa,
  cronograma: Cronograma,
  usuarios: { supervisor: bigint; calidad: bigint; logistica: bigint },
): PasoPlan[] {
  const pasos: PasoPlan[] = [];

  pasos.push(
    ...intentosFase(rng, {
      idFase: ctx.fasesMain.PRODUCCION,
      idResponsable: usuarios.supervisor,
      fechaInicio: cronograma.fechaSiembra,
      fechaFin: cronograma.fechaCosecha,
      estadoFinal: etapa === 'EN_PRODUCCION' ? EstadoFlujo.EN_PROCESO : EstadoFlujo.COMPLETADO,
      probRetry: 0,
      probRetryExtra: 0,
      datos: { actividad: 'Manejo agronómico del cultivo', responsable: 'Supervisor agrícola' },
    }),
  );

  if (etapa === 'EN_PRODUCCION') return pasos;

  const calidadFinal = estadoFinalCalidad(etapa);
  const probCalidad =
    etapa === 'COSECHADO' ? 0 : PROB_RETRY_CALIDAD;
  const probCalidad3 = etapa === 'COSECHADO' ? 0 : PROB_RETRY_CALIDAD_3;
  pasos.push(
    ...intentosFase(rng, {
      idFase: ctx.fasesMain.CALIDAD,
      idResponsable: usuarios.calidad,
      fechaInicio: cronograma.fechaCosecha!,
      fechaFin: cronograma.fechaControl,
      estadoFinal: calidadFinal,
      probRetry: probCalidad,
      probRetryExtra: probCalidad3,
      datos: { motivo: 'Inspección de calidad e inocuidad', responsable: 'Inspector de calidad' },
    }),
  );

  if (etapa === 'COSECHADO' || etapa === 'CALIDAD' || etapa === 'CALIDAD_RECHAZADO') {
    return pasos;
  }

  pasos.push(
    ...intentosFase(rng, {
      idFase: ctx.fasesMain.EMPAQUE,
      idResponsable: usuarios.calidad,
      fechaInicio: cronograma.fechaEmpaque!,
      fechaFin: cronograma.fechaSalida,
      estadoFinal: EstadoFlujo.COMPLETADO,
      probRetry: PROB_RETRY_EMPAQUE,
      probRetryExtra: 0,
      datos: { actividad: 'Lavado, selección y empaque', responsable: 'Jefe de empaque' },
    }),
  );

  const logisticaCompleta = etapa === 'EXPORTADO' || etapa === 'CERRADO';
  pasos.push(
    ...intentosFase(rng, {
      idFase: ctx.fasesMain.LOGISTICA,
      idResponsable: usuarios.logistica,
      fechaInicio: cronograma.fechaSalida!,
      fechaFin:
        etapa === 'CERRADO' ? cronograma.fechaEntrega : cronograma.fechaTransito,
      estadoFinal: logisticaCompleta ? EstadoFlujo.COMPLETADO : EstadoFlujo.EN_PROCESO,
      probRetry: logisticaCompleta ? PROB_RETRY_LOGISTICA : 0,
      probRetryExtra: 0,
      datos: { actividad: 'Logística y exportación', responsable: 'Jefe de logística' },
    }),
  );

  return pasos;
}

function transicionesDePasos(
  rng: () => number,
  instancia: InstanciaPlan,
  pasos: PasoPlan[],
): TransicionPlan[] {
  const ejecuciones = pasos.map(
    (paso): EjecucionPlan => ({
      instancia,
      idFase: paso.idFase,
      idResponsable: paso.idResponsable,
      numeroIntento: paso.numeroIntento,
      estado: paso.estadoFinal,
      datosAdicionales: paso.datosAdicionales,
      fechaInicio: paso.fechaInicio,
      fechaFin: paso.fechaFin,
      fechaRegistro: paso.fechaInicio,
    }),
  );

  const crear = (
    ejecucion: EjecucionPlan,
    estadoAnterior: EstadoFlujo | null,
    estadoNuevo: EstadoFlujo,
    fecha: Date,
    comentario: string,
    datos: Prisma.InputJsonValue,
  ): TransicionPlan => ({
    instancia,
    ejecucion,
    estadoAnterior,
    estadoNuevo,
    idUsuario: ejecucion.idResponsable ?? BigInt(1),
    comentario,
    datosAdicionales: datos,
    fechaTransicion: fecha,
  });

  const transiciones: TransicionPlan[] = [];
  pasos.forEach((paso, i) => {
    if (i === 0) {
      transiciones.push(
        crear(
          ejecuciones[0],
          null,
          EstadoFlujo.EN_PROCESO,
          conHoraLaboral(rng, paso.fechaInicio),
          'Inicio automático del flujo al crear la unidad (seed)',
          { motivo: 'Registro inicial', responsable: 'Supervisor agrícola' },
        ),
      );
    } else {
      const anterior = pasos[i - 1];
      transiciones.push(
        crear(
          ejecuciones[i - 1],
          EstadoFlujo.EN_PROCESO,
          anterior.estadoFinal === EstadoFlujo.RECHAZADO ? EstadoFlujo.RECHAZADO : EstadoFlujo.COMPLETADO,
          conHoraLaboral(rng, anterior.fechaFin ?? paso.fechaInicio),
          anterior.estadoFinal === EstadoFlujo.RECHAZADO
            ? 'Fase rechazada, se reabre un nuevo intento (seed)'
            : 'Avance de flujo (seed)',
          { motivo: 'Avance de flujo', responsable: 'Supervisor agrícola' },
        ),
      );
      transiciones.push(
        crear(
          ejecuciones[i],
          EstadoFlujo.PENDIENTE,
          EstadoFlujo.EN_PROCESO,
          conHoraLaboral(rng, paso.fechaInicio),
          'Inicio de fase (seed)',
          { motivo: 'Inicio de fase', responsable: 'Supervisor agrícola' },
        ),
      );
    }
  });

  const ultimo = pasos[pasos.length - 1];
  if (ultimo.estadoFinal === EstadoFlujo.COMPLETADO || ultimo.estadoFinal === EstadoFlujo.RECHAZADO) {
    transiciones.push(
      crear(
        ejecuciones[ejecuciones.length - 1],
        EstadoFlujo.EN_PROCESO,
        ultimo.estadoFinal,
        conHoraLaboral(rng, ultimo.fechaFin ?? ultimo.fechaInicio),
        ultimo.estadoFinal === EstadoFlujo.RECHAZADO
          ? 'Fase rechazada (seed)'
          : 'Finalización de fase (seed)',
        { motivo: 'Finalización de fase', responsable: 'Supervisor agrícola' },
      ),
    );
  }

  return transiciones;
}

// ---------------------------------------------------------------------------
// Cajas y envíos: solo las ejecuciones COMPLETADAS/RECHAZADAS llevan historia
// (transición + bloque). La ejecución ACTIVA (EN_PROCESO) no lleva transición
// ni bloque propios: los genera la app cuando avanza la fase.
// ---------------------------------------------------------------------------
function ejecucionesDePasos(instancia: InstanciaPlan, pasos: PasoPlan[]): EjecucionPlan[] {
  return pasos.map(
    (paso): EjecucionPlan => ({
      instancia,
      idFase: paso.idFase,
      idResponsable: paso.idResponsable,
      numeroIntento: paso.numeroIntento,
      estado: paso.estadoFinal,
      datosAdicionales: paso.datosAdicionales,
      fechaInicio: paso.fechaInicio,
      fechaFin: paso.fechaFin,
      fechaRegistro: paso.fechaInicio,
    }),
  );
}

function transicionesDeEmpaque(
  rng: () => number,
  instancia: InstanciaPlan,
  ejecuciones: EjecucionPlan[],
): TransicionPlan[] {
  const crear = (
    ejecucion: EjecucionPlan,
    estadoAnterior: EstadoFlujo | null,
    estadoNuevo: EstadoFlujo,
    fecha: Date,
    comentario: string,
    datos: Prisma.InputJsonValue,
  ): TransicionPlan => ({
    instancia,
    ejecucion,
    estadoAnterior,
    estadoNuevo,
    idUsuario: ejecucion.idResponsable ?? BigInt(1),
    comentario,
    datosAdicionales: datos,
    fechaTransicion: fecha,
  });

  const transiciones: TransicionPlan[] = [];
  ejecuciones.forEach((ejecucion, i) => {
    if (
      ejecucion.estado === EstadoFlujo.EN_PROCESO ||
      ejecucion.estado === EstadoFlujo.PENDIENTE
    ) {
      return;
    }
    const esTerminal = i === ejecuciones.length - 1;
    const siguiente = ejecuciones[i + 1];
    transiciones.push(
      crear(
        ejecucion,
        esTerminal ? null : EstadoFlujo.EN_PROCESO,
        ejecucion.estado,
        conHoraLaboral(rng, ejecucion.fechaFin ?? siguiente?.fechaInicio ?? ejecucion.fechaInicio),
        ejecucion.estado === EstadoFlujo.RECHAZADO
          ? 'Fase rechazada, se reabre un nuevo intento (seed)'
          : esTerminal
            ? 'Finalización de flujo (seed)'
            : 'Avance de flujo (seed)',
        { motivo: 'Avance de caja o envío', responsable: 'Jefe de logística' },
      ),
    );
  });

  return transiciones;
}

function estadoInstancia(etapa: Etapa): EstadoFlujo {
  if (etapa === 'EXPORTADO' || etapa === 'CERRADO') return EstadoFlujo.COMPLETADO;
  return EstadoFlujo.EN_PROCESO;
}

// ---------------------------------------------------------------------------
// Event generation.
// ---------------------------------------------------------------------------
function eventosProduccion(
  rng: () => number,
  ctx: PlanContext,
  cronograma: Cronograma,
  unidad: UnidadPlan,
  ejecucion: EjecucionPlan,
  nombreFinca: string,
  idUsuario: bigint,
): EventoPlan[] {
  const eventos: EventoPlan[] = [];
  const siembra = cronograma.fechaSiembra;
  const tope = cronograma.fechaCosecha ?? hoy();

  const agregar = (
    tipo: string,
    fecha: Date,
    descripcion: string,
    datos: Prisma.InputJsonValue,
  ): void => {
    const idTipoEvento = ctx.tiposEvento.get(tipo);
    if (!idTipoEvento) return;
    eventos.push({
      unidad,
      ejecucion,
      idTipoEvento,
      idUsuario,
      fechaEvento: conHoraLaboral(rng, fecha),
      ubicacion: nombreFinca,
      descripcion,
      datosAdicionales: datos,
      fechaRegistro: fecha,
    });
  };

  agregar('SIEMBRA', siembra, 'Registro de siembra del lote', {
    humedadRelativa: redondear(randomEntre(rng, 72, 88), 1),
    temperaturaAmbiente: redondear(randomEntre(rng, 24, 32), 1),
    responsable: 'Supervisor agrícola',
    equipo: `Cuadrilla de siembra ${enteroEntre(rng, 1, 12)}`,
  });

  const dias = Math.max(60, Math.round((tope.getTime() - siembra.getTime()) / 86_400_000));
  const meses = Math.min(11, Math.max(4, Math.floor(dias / 30)));
  const actividades: Array<{
    tipo: string;
    prob: number;
    descripcion: string;
    datos: (r: () => number) => Prisma.InputJsonValue;
  }> = [
    {
      tipo: 'RIEGO',
      prob: 1,
      descripcion: 'Riego programado del lote',
      datos: (r) => ({
        humedadRelativa: redondear(randomEntre(r, 70, 90), 1),
        temperaturaAmbiente: redondear(randomEntre(r, 22, 34), 1),
        responsable: 'Supervisor agrícola',
        producto: 'Agua de riego por gravedad',
      }),
    },
    {
      tipo: 'FERTILIZACION',
      prob: 0.65,
      descripcion: 'Aplicación de fertilizante foliar',
      datos: (r) => ({
        humedadRelativa: redondear(randomEntre(r, 72, 88), 1),
        temperaturaAmbiente: redondear(randomEntre(r, 22, 32), 1),
        responsable: 'Supervisor agrícola',
        producto: 'Dosis estándar del programa de manejo',
      }),
    },
    {
      tipo: 'FUMIGACION',
      prob: 0.55,
      descripcion: 'Control fitosanitario preventivo',
      datos: (r) => ({
        humedadRelativa: redondear(randomEntre(r, 70, 86), 1),
        temperaturaAmbiente: redondear(randomEntre(r, 22, 31), 1),
        responsable: 'Supervisor agrícola',
        producto: 'Producto del programa de manejo integrado',
      }),
    },
    {
      tipo: 'INSPECCION_CAMPO',
      prob: 0.7,
      descripcion: 'Inspección del estado del cultivo',
      datos: (r) => ({
        humedadRelativa: redondear(randomEntre(r, 68, 90), 1),
        temperaturaAmbiente: redondear(randomEntre(r, 22, 34), 1),
        responsable: 'Supervisor agrícola',
        estadoCultivo: elegir(r, ['Bueno', 'Muy bueno', 'Regular']),
      }),
    },
  ];

  for (let m = 1; m <= meses; m++) {
    for (const actividad of actividades) {
      if (rng() > actividad.prob) continue;
      const fecha = sumarDias(siembra, m * 30 + enteroEntre(rng, -4, 9));
      if (fecha.getTime() > tope.getTime()) continue;
      agregar(actividad.tipo, fecha, actividad.descripcion, actividad.datos(rng));
    }
  }

  return eventos;
}

function eventosPostCosecha(
  rng: () => number,
  ctx: PlanContext,
  etapa: Etapa,
  cronograma: Cronograma,
  unidad: UnidadPlan,
  ejecuciones: EjecucionPlan[],
  nombreFinca: string,
  usuarios: { calidad: bigint; logistica: bigint },
): EventoPlan[] {
  const eventos: EventoPlan[] = [];
  const ejecucionCalidad = ejecuciones.find((e) => e.idFase === ctx.fasesMain.CALIDAD);
  const ejecucionEmpaque = ejecuciones.find((e) => e.idFase === ctx.fasesMain.EMPAQUE);
  const ejecucionLogistica = ejecuciones.find((e) => e.idFase === ctx.fasesMain.LOGISTICA);

  const agregar = (
    tipo: string,
    ejecucion: EjecucionPlan | undefined,
    fecha: Date,
    idUsuario: bigint,
    ubicacion: string,
    descripcion: string,
    datos: Prisma.InputJsonValue,
  ): void => {
    const idTipoEvento = ctx.tiposEvento.get(tipo);
    if (!idTipoEvento || !ejecucion) return;
    eventos.push({
      unidad,
      ejecucion,
      idTipoEvento,
      idUsuario,
      fechaEvento: conHoraLaboral(rng, fecha),
      ubicacion,
      descripcion,
      datosAdicionales: datos,
      fechaRegistro: fecha,
    });
  };

  if (etapa === 'COSECHADO' || etapa === 'CALIDAD' || etapa === 'CALIDAD_RECHAZADO') {
    agregar('COSECHA', ejecucionCalidad, cronograma.fechaCosecha!, usuarios.calidad, nombreFinca,
      'Corte y recolección de racimos del lote', {
        humedadRelativa: redondear(randomEntre(rng, 70, 92), 1),
        temperaturaAmbiente: redondear(randomEntre(rng, 23, 31), 1),
        responsable: 'Jefe de cosecha',
        numRacimos: enteroEntre(rng, 90, 220),
      });
  }

  if (cronograma.fechaControl) {
    agregar('RECEPCION', ejecucionCalidad, cronograma.fechaControl, usuarios.calidad, nombreFinca,
      'Recepción de racimos en la empacadora', {
        pesoBrutoKg: redondear(randomEntre(rng, 800, 4000), 0),
        temperaturaPulpa: redondear(randomEntre(rng, 13, 16), 1),
        responsable: 'Inspector de calidad',
      });

    const intentosCalidad = ejecuciones.filter((e) => e.idFase === ctx.fasesMain.CALIDAD);
    intentosCalidad.forEach((intento, idx) => {
      agregar('CONTROL_CALIDAD', intento, sumarDias(cronograma.fechaControl!, idx), usuarios.calidad,
        nombreFinca, 'Inspección de calidad e inocuidad del lote', {
          turno: elegir(rng, ['Matutino', 'Vespertino']),
          nroInspectores: enteroEntre(rng, 2, 5),
          temperaturaAmbiente: redondear(randomEntre(rng, 22, 30), 1),
          intento: intento.numeroIntento,
          responsable: 'Inspector de calidad',
        });
    });
  }

  if (etapa === 'COSECHADO' || etapa === 'CALIDAD' || etapa === 'CALIDAD_RECHAZADO') {
    return eventos;
  }

  if (cronograma.fechaEmpaque) {
    agregar('EMPACADO', ejecucionEmpaque, cronograma.fechaEmpaque, usuarios.calidad, nombreFinca,
      'Lavado, selección y empaque del lote', {
        linea: `Línea ${enteroEntre(rng, 1, 4)}`,
        operador: `Cuadrilla ${enteroEntre(rng, 1, 8)}`,
        responsable: 'Jefe de empaque',
      });
  }

  if (etapa === 'EMPACADO') return eventos;

  if (cronograma.fechaCargado) {
    agregar('TRANSPORTE', ejecucionLogistica, cronograma.fechaCargado, usuarios.logistica,
      'Puerto Bolívar', 'Traslado de contenedor al puerto de embarque', {
        placa: `PLACA-${enteroEntre(rng, 1000, 9999)}`,
        conductor: 'Transporte contratado',
        responsable: 'Jefe de logística',
      });
  }
  if (cronograma.fechaSalida) {
    agregar('TRANSPORTE', ejecucionLogistica, cronograma.fechaSalida, usuarios.logistica,
      'Puerto Bolívar', 'Embarque del contenedor para exportación', {
        responsable: 'Agente de carga',
      });
  }

  return eventos;
}

function documentosExportacion(
  rng: () => number,
  ctx: PlanContext,
  params: { lote: string; envio: string; contenedor: string; anio: number; fecha: Date },
): DocumentoPlan[] {
  const certificado = ctx.tiposDocumento.get('CERTIFICADO');
  const conocimiento = ctx.tiposDocumento.get('CONOCIMIENTO_EMBARQUE');
  const guia = ctx.tiposDocumento.get('GUIA_REMISION');
  const candidatos: DocumentoPlan[] = [];

  if (certificado) {
    candidatos.push({
      idTipoDocumento: certificado,
      nombre: `Certificado fitosanitario ${params.lote}`,
      url: `https://docs.bananotrace.test/${params.anio}/fitosanitario/${params.lote}.pdf`,
      fechaCarga: conHoraLaboral(rng, sumarDias(params.fecha, enteroEntre(rng, 0, 2))),
    });
    candidatos.push({
      idTipoDocumento: certificado,
      nombre: `Certificado de origen ${params.lote}`,
      url: `https://docs.bananotrace.test/${params.anio}/origen/${params.lote}.pdf`,
      fechaCarga: conHoraLaboral(rng, sumarDias(params.fecha, enteroEntre(rng, 0, 2))),
    });
  }
  if (conocimiento) {
    candidatos.push({
      idTipoDocumento: conocimiento,
      nombre: `Bill of lading ${params.contenedor}`,
      url: `https://docs.bananotrace.test/${params.anio}/embarque/${params.contenedor}.pdf`,
      fechaCarga: conHoraLaboral(rng, sumarDias(params.fecha, enteroEntre(rng, 0, 3))),
    });
  }
  if (guia) {
    candidatos.push({
      idTipoDocumento: guia,
      nombre: `Guía de remisión ${params.envio}`,
      url: `https://docs.bananotrace.test/${params.anio}/guia/${params.envio}.pdf`,
      fechaCarga: conHoraLaboral(rng, sumarDias(params.fecha, enteroEntre(rng, 0, 3))),
    });
  }

  const cantidad = enteroEntre(rng, 2, 4);
  const resultado: DocumentoPlan[] = [];
  for (let i = 0; i < cantidad && i < candidatos.length; i++) {
    resultado.push(candidatos[i]);
  }
  return resultado;
}

function eventosCaja(
  rng: () => number,
  ctx: PlanContext,
  caja: CajaPlan,
  nombreFinca: string,
  fechaInicio: Date,
  fechaFin: Date,
  idUsuario: bigint,
): EventoPlan[] {
  const eventos: EventoPlan[] = [];
  const descripcionesEmpaque = [
    'Lavado de la fruta previo al empaque',
    'Selección y clasificación por calibre',
    'Pesaje y armado de la caja',
    'Codificación y etiquetado de la caja',
    'Verificación de peso de la caja',
  ];
  const descripcionesTransporte = [
    'Asignación de caja a envío',
    'Carga de caja en contenedor',
    'Caja en tránsito',
    'Descarga de caja en destino',
  ];
  const cantidad = enteroEntre(rng, 9, 15);
  const ejecuciones = caja.ejecuciones;

  for (let i = 0; i < cantidad; i++) {
    const t = fechaInicio.getTime() + (fechaFin.getTime() - fechaInicio.getTime()) * (rng() * 0.9 + 0.05);
    const fecha = new Date(t);
    const ejecucion = ejecuciones[Math.min(i % ejecuciones.length, ejecuciones.length - 1)];
    const idTipoEvento = i % 2 === 0 ? ctx.tiposEvento.get('EMPACADO') : ctx.tiposEvento.get('TRANSPORTE');
    if (!idTipoEvento || !ejecucion) continue;
    const esEmpaque = i % 2 === 0;
    eventos.push({
      unidad: caja.unidad,
      ejecucion,
      idTipoEvento,
      idUsuario,
      fechaEvento: conHoraLaboral(rng, fecha),
      ubicacion: esEmpaque ? nombreFinca : 'Puerto Bolívar',
      descripcion: esEmpaque
        ? descripcionesEmpaque[i % descripcionesEmpaque.length]
        : descripcionesTransporte[i % descripcionesTransporte.length],
      datosAdicionales: esEmpaque
        ? { linea: `Línea ${enteroEntre(rng, 1, 4)}`, responsable: 'Jefe de empaque' }
        : { contenedor: 'CONT', responsable: 'Jefe de logística' },
      fechaRegistro: fecha,
    });
  }
  return eventos;
}

function eventosEnvio(
  rng: () => number,
  ctx: PlanContext,
  envio: EnvioPlan,
  etapa: Etapa,
  fechaSalida: Date,
  fechaLlegada: Date,
): EventoPlan[] {
  const eventos: EventoPlan[] = [];
  const ejecuciones = envio.ejecuciones;
  const idUsuario = envio.envioDatos.idNaviera !== null ? ctx.logistica[0] : ctx.logistica[0];

  const agregarGps = (fecha: Date, lat: number, lon: number, descripcion: string): void => {
    const idTipoEvento = ctx.tiposEvento.get('TRANSPORTE');
    const ejecucion = ejecuciones[Math.min(Math.floor(rng() * ejecuciones.length), ejecuciones.length - 1)];
    if (!idTipoEvento || !ejecucion) return;
    eventos.push({
      unidad: envio.unidad,
      ejecucion,
      idTipoEvento,
      idUsuario,
      fechaEvento: conHoraLaboral(rng, fecha),
      ubicacion: 'Océano Pacífico',
      descripcion,
      datosAdicionales: {
        latitud: redondear(lat, 4),
        longitud: redondear(lon, 4),
        temperaturaContenedor: redondear(randomEntre(rng, 12.8, 14.2), 1),
        responsable: 'Agente de carga',
      },
      fechaRegistro: fecha,
    });
  };

  const latInicio = randomEntre(rng, -3.3, -2.9);
  const lonInicio = randomEntre(rng, -80.1, -79.8);
  const latFin = randomEntre(rng, 50.5, 52.3);
  const lonFin = randomEntre(rng, 3.8, 4.9);

  const nPings = etapa === 'EMPACADO' ? 2 : enteroEntre(rng, 10, 20);
  for (let i = 0; i < nPings; i++) {
    const t = fechaSalida.getTime() + (fechaLlegada.getTime() - fechaSalida.getTime()) * (rng());
    const lat = latInicio + (latFin - latInicio) * (rng());
    const lon = lonInicio + (lonFin - lonInicio) * (rng());
    agregarGps(new Date(t), lat, lon, 'Monitoreo satelital del contenedor');
  }
  return eventos;
}

// ---------------------------------------------------------------------------
// Lot planning (pure in-memory; DB ids are resolved later).
// ---------------------------------------------------------------------------
function numCajasLote(rng: () => number): number {
  const roll = rng();
  if (roll < 0.6) return 1;
  if (roll < 0.88) return 2;
  if (roll < 0.98) return 3;
  return 4;
}

function planearLote(
  rng: () => number,
  ctx: PlanContext,
  etapa: Etapa,
  indice: number,
): LotePlan {
  const cronograma = cronogramaEtapa(rng, etapa);
  const anioSiembra = cronograma.fechaSiembra.getUTCFullYear();
  const codigoLote = correlativos.LOTE.siguiente('BAN', anioSiembra);
  const finca = elegirPonderado(rng, ctx.fincas, (f) => Math.max(f.areaHectareas, 1));
  const idVariedad = elegir(rng, ctx.variedades);
  const idUsuarioSupervisor = elegir(rng, ctx.supervisores);
  const idUsuarioCalidad = elegir(rng, ctx.calidad);
  const idUsuarioLogistica = elegir(rng, ctx.logistica);

  const unidad: UnidadPlan = {
    tipo: TipoUnidadTrazable.LOTE,
    codigo: codigoLote,
    fechaRegistro: cronograma.fechaSiembra,
  };

  const cantidadPlantas = cantidadPlantasLote(rng, finca.areaHectareas);
  const pesoCosechadoKg = cronograma.fechaCosecha
    ? pesoCosechadoLote(rng, cantidadPlantas, cronograma.fechaCosecha)
    : null;

  const lote: LoteDatos = {
    idFinca: finca.idFinca,
    idVariedad,
    codigoLote,
    fechaSiembra: cronograma.fechaSiembra,
    fechaEstimadaCosecha: cronograma.fechaEstimadaCosecha,
    fechaCosecha: cronograma.fechaCosecha,
    cantidadPlantas,
    pesoCosechadoKg,
    estado:
      etapa === 'PLANIFICADO'
        ? EstadoLote.PLANIFICADO
        : etapa === 'COSECHADO' || etapa === 'CALIDAD' || etapa === 'CALIDAD_RECHAZADO'
          ? EstadoLote.COSECHADO
          : etapa === 'EMPACADO'
            ? EstadoLote.EMPACADO
            : etapa === 'EXPORTADO' || etapa === 'CERRADO'
              ? EstadoLote.EXPORTADO
              : EstadoLote.EN_PRODUCCION,
    fechaRegistro: etapa === 'PLANIFICADO' ? hoy() : cronograma.fechaSiembra,
  };

  const plan: LotePlan = {
    unidad,
    lote,
    instancia: null,
    ejecuciones: [],
    transiciones: [],
    controles: [],
    cajas: [],
    envio: null,
    eventosLote: [],
    eventoExportacion: null,
    documentos: [],
  };

  if (etapa === 'PLANIFICADO') {
    return plan;
  }

  const instancia: InstanciaPlan = {
    codigo: `FLW-BIG-L-${codigoLote}`,
    idFlujo: ctx.idFlujoPrincipal,
    estado: estadoInstancia(etapa),
    fechaInicio: cronograma.fechaSiembra,
    fechaRegistro: cronograma.fechaSiembra,
  };
  plan.instancia = instancia;

  const pasos = pasosEtapa(rng, ctx, etapa, cronograma, {
    supervisor: idUsuarioSupervisor,
    calidad: idUsuarioCalidad,
    logistica: idUsuarioLogistica,
  });
  const transiciones = transicionesDePasos(rng, instancia, pasos);
  plan.ejecuciones = transiciones.map((t) => t.ejecucion);
  plan.transiciones = transiciones;

  plan.eventosLote.push(
    ...eventosProduccion(rng, ctx, cronograma, unidad, plan.ejecuciones[0], finca.nombre, idUsuarioSupervisor),
  );
  plan.eventosLote.push(
    ...eventosPostCosecha(rng, ctx, etapa, cronograma, unidad, plan.ejecuciones, finca.nombre, {
      calidad: idUsuarioCalidad,
      logistica: idUsuarioLogistica,
    }),
  );

  // Control de calidad (one record on the last CALIDAD attempt).
  const ejecucionCalidad = plan.ejecuciones.filter((e) => e.idFase === ctx.fasesMain.CALIDAD);
  const ejecucionCalidadFinal = ejecucionCalidad[ejecucionCalidad.length - 1];
  if (
    ejecucionCalidadFinal &&
    (etapa === 'CALIDAD' || etapa === 'CALIDAD_RECHAZADO' || etapa === 'EMPACADO' || etapa === 'EXPORTADO' || etapa === 'CERRADO')
  ) {
    const esRechazado = etapa === 'CALIDAD_RECHAZADO';
    const resultado = esRechazado
      ? ResultadoControl.RECHAZADO
      : rng() < 0.7
        ? ResultadoControl.APROBADO
        : ResultadoControl.OBSERVADO;
    const mesControl = cronograma.fechaControl!.getUTCMonth();
    const calibre = calibreLote(rng);
    const pesoMuestra = pesoMuestraLote(rng);
    const porcentaje = porcentajeRechazoLote(rng, resultado, mesControl);
    plan.controles.push({
      ejecucion: ejecucionCalidadFinal,
      idUsuario: idUsuarioCalidad,
      idCategoriaCalidad: elegir(rng, ctx.categorias),
      fechaControl: conHoraLaboral(rng, cronograma.fechaControl!),
      calibreMm: calibre,
      pesoMuestraKg: pesoMuestra,
      porcentajeRechazo: porcentaje,
      resultado,
      observaciones: observar(rng, resultado),
    });
  }

  if (etapa === 'EN_PRODUCCION' || etapa === 'CALIDAD' || etapa === 'CALIDAD_RECHAZADO' || etapa === 'COSECHADO') {
    return plan;
  }

  // Cajas (only in EMPAQUE phase and beyond).
  const ejecucionEmpaque = plan.ejecuciones.find((e) => e.idFase === ctx.fasesMain.EMPAQUE);
  const nCajas = numCajasLote(rng);
  const anioEmpaque = cronograma.fechaEmpaque!.getUTCFullYear();

  for (let c = 0; c < nCajas; c++) {
    const codigoCaja = correlativos.EMPAQUE.siguiente('CAJ', anioEmpaque);
    const unidadCaja: UnidadPlan = {
      tipo: TipoUnidadTrazable.EMPAQUE,
      codigo: codigoCaja,
      fechaRegistro: cronograma.fechaEmpaque!,
    };
    const instanciaCaja: InstanciaPlan = {
      codigo: `FLW-BIG-E-${codigoCaja}`,
      idFlujo: ctx.idFlujoEmpaque,
      estado: etapa === 'CERRADO' ? EstadoFlujo.COMPLETADO : EstadoFlujo.EN_PROCESO,
      fechaInicio: cronograma.fechaEmpaque!,
      fechaRegistro: cronograma.fechaEmpaque!,
    };

    const pasosCaja: PasoPlan[] = [];
    const estadosEmpaque: EstadoEmpaque[] = [EstadoEmpaque.DISPONIBLE, EstadoEmpaque.ASIGNADO, EstadoEmpaque.EN_TRANSITO, EstadoEmpaque.ENTREGADO];
    const nPasosCaja = etapa === 'CERRADO' ? 4 : etapa === 'EXPORTADO' ? 3 : 1;
    for (let s = 0; s < nPasosCaja; s++) {
      const esUltimo = s === nPasosCaja - 1;
      const esTerminal = etapa === 'CERRADO';
      const fechaFin = esUltimo && esTerminal ? cronograma.fechaEntrega ?? cronograma.fechaTransito : null;
      pasosCaja.push(
        ...intentosFase(rng, {
          idFase:
            s === 0
              ? ctx.fasesEmpaque.DISPONIBLE
              : s === 1
                ? ctx.fasesEmpaque.ASIGNADO
                : s === 2
                  ? ctx.fasesEmpaque.EN_TRANSITO
                  : ctx.fasesEmpaque.ENTREGADO,
          idResponsable: idUsuarioLogistica,
          fechaInicio: cronograma.fechaEmpaque!,
          fechaFin,
          estadoFinal: esUltimo
            ? esTerminal
              ? EstadoFlujo.COMPLETADO
              : EstadoFlujo.EN_PROCESO
            : EstadoFlujo.COMPLETADO,
          probRetry: 0,
          probRetryExtra: 0,
          datos: { actividad: 'Avance de caja', responsable: 'Jefe de logística' },
        }),
      );
    }

    const ejecucionesCaja = ejecucionesDePasos(instanciaCaja, pasosCaja);
    const transicionesCaja = transicionesDeEmpaque(rng, instanciaCaja, ejecucionesCaja);
    const caja: CajaPlan = {
      unidad: unidadCaja,
      instancia: instanciaCaja,
      ejecuciones: ejecucionesCaja,
      transiciones: transicionesCaja,
      empaqueEjecucion: ejecucionEmpaque!,
      empaqueDatos: {
        idCategoriaCalidad: elegir(rng, ctx.categorias),
        codigoCaja,
        fechaEmpaque: cronograma.fechaEmpaque!,
        pesoNetoKg: pesoNetoCaja(rng),
        estado: estadosEmpaque[nPasosCaja - 1],
      },
      eventos: [],
    };
    caja.eventos = eventosCaja(
      rng,
      ctx,
      caja,
      finca.nombre,
      cronograma.fechaEmpaque!,
      cronograma.fechaEntrega ?? cronograma.fechaTransito ?? cronograma.fechaEmpaque!,
      idUsuarioLogistica,
    );
    plan.cajas.push(caja);
  }

  // Envío (always for EXPORTADO/CERRADO; partial for EMPACADO).
  const crearEnvio =
    etapa === 'EXPORTADO' || etapa === 'CERRADO' || rng() < PROB_ENVIO_EMPACADO;
  if (crearEnvio && cronograma.fechaSalida) {
    const anioSalida = cronograma.fechaSalida.getUTCFullYear();
    const codigoEnvio = correlativos.ENVIO.siguiente('ENV', anioSalida);
    const naviera = elegir(rng, ctx.navieras);
    const puertoOrigen = elegir(rng, ctx.puertosOrigen);
    const puertoDestino = elegir(rng, ctx.puertosDestino);
    const numeroCont = numeroContenedor(rng, anioSalida);

    const unidadEnvio: UnidadPlan = {
      tipo: TipoUnidadTrazable.ENVIO,
      codigo: codigoEnvio,
      fechaRegistro: cronograma.fechaSalida,
    };
    const instanciaEnvio: InstanciaPlan = {
      codigo: `FLW-BIG-S-${codigoEnvio}`,
      idFlujo: ctx.idFlujoEnvio,
      estado: etapa === 'CERRADO' ? EstadoFlujo.COMPLETADO : EstadoFlujo.EN_PROCESO,
      fechaInicio: cronograma.fechaSalida,
      fechaRegistro: cronograma.fechaSalida,
    };

    const estadosEnvio: EstadoEnvio[] = [EstadoEnvio.PLANIFICADO, EstadoEnvio.CARGADO, EstadoEnvio.EN_TRANSITO, EstadoEnvio.ENTREGADO];
    const nPasosEnvio = etapa === 'CERRADO' ? 4 : etapa === 'EXPORTADO' ? 3 : 1;
    const esEnvioTerminal = etapa === 'CERRADO';
    const pasosEnvio: PasoPlan[] = [];
    for (let s = 0; s < nPasosEnvio; s++) {
      const esUltimo = s === nPasosEnvio - 1;
      const fechaFin = esUltimo && esEnvioTerminal ? cronograma.fechaEntrega ?? cronograma.fechaTransito : null;
      pasosEnvio.push(
        ...intentosFase(rng, {
          idFase:
            s === 0
              ? ctx.fasesEnvio.PLANIFICADO
              : s === 1
                ? ctx.fasesEnvio.CARGADO
                : s === 2
                  ? ctx.fasesEnvio.EN_TRANSITO
                  : ctx.fasesEnvio.ENTREGADO,
          idResponsable: idUsuarioLogistica,
          fechaInicio: cronograma.fechaSalida,
          fechaFin,
          estadoFinal: esUltimo
            ? esEnvioTerminal
              ? EstadoFlujo.COMPLETADO
              : EstadoFlujo.EN_PROCESO
            : EstadoFlujo.COMPLETADO,
          probRetry: esUltimo && esEnvioTerminal ? PROB_RETRY_ENVIO_FLOW : 0,
          probRetryExtra: 0,
          datos: { actividad: 'Avance de envío', responsable: 'Jefe de logística' },
        }),
      );
    }

    const ejecucionesEnvio = ejecucionesDePasos(instanciaEnvio, pasosEnvio);
    const transicionesEnvio = transicionesDeEmpaque(rng, instanciaEnvio, ejecucionesEnvio);
    const ejecucionLogistica = plan.ejecuciones.find((e) => e.idFase === ctx.fasesMain.LOGISTICA);
    const fechaEstimadaLlegada =
      etapa === 'CERRADO' && cronograma.fechaEntrega
        ? restarDias(cronograma.fechaEntrega, enteroEntre(rng, 0, 5))
        : sumarDias(cronograma.fechaSalida, enteroEntre(rng, 15, 28));

    const envio: EnvioPlan = {
      unidad: unidadEnvio,
      instancia: instanciaEnvio,
      ejecuciones: ejecucionesEnvio,
      transiciones: transicionesEnvio,
      logisticaEjecucion: ejecucionLogistica!,
      envioDatos: {
        idNaviera: naviera,
        idPuertoOrigen: puertoOrigen,
        idPuertoDestino: puertoDestino,
        codigoEnvio,
        numeroContenedor: numeroCont,
        fechaSalida: cronograma.fechaSalida,
        fechaEstimadaLlegada,
        temperaturaSalida: temperaturaSalidaEnvio(rng, cronograma.fechaSalida.getUTCMonth()),
        estado: estadosEnvio[nPasosEnvio - 1],
      },
      cajas: plan.cajas,
      eventos: [],
    };
    envio.eventos = eventosEnvio(rng, ctx, envio, etapa, cronograma.fechaSalida, fechaEstimadaLlegada);
    plan.envio = envio;

    if (etapa === 'EXPORTADO' || etapa === 'CERRADO') {
      const idExportacion = ctx.tiposEvento.get('EXPORTACION');
      const ejecucionLog = plan.ejecuciones.find((e) => e.idFase === ctx.fasesMain.LOGISTICA);
      if (idExportacion && ejecucionLog) {
        plan.eventoExportacion = {
          unidad,
          ejecucion: ejecucionLog,
          idTipoEvento: idExportacion,
          idUsuario: idUsuarioLogistica,
          fechaEvento: conHoraLaboral(rng, cronograma.fechaSalida),
          ubicacion: 'Puerto Bolívar',
          descripcion: 'Embarque del contenedor para exportación',
          datosAdicionales: {
            naviera: 'Naviera contratada',
            contenedor: numeroCont,
            sello: `SEAL-${enteroEntre(rng, 10000, 99999)}`,
            responsable: 'Agente de carga',
          },
          fechaRegistro: cronograma.fechaSalida,
        };
        plan.documentos = documentosExportacion(rng, ctx, {
          lote: codigoLote,
          envio: codigoEnvio,
          contenedor: numeroCont,
          anio: anioSalida,
          fecha: cronograma.fechaSalida,
        });
      }
    }
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Chunked flush (bulk inserts + read-back of generated ids).
// ---------------------------------------------------------------------------
function createManyChunked<T>(
  fn: (data: T[]) => Promise<unknown>,
  rows: T[],
  size: number,
): Promise<void> {
  let index = 0;
  const run = async (): Promise<void> => {
    if (index >= rows.length) return;
    const slice = rows.slice(index, index + size);
    index += slice.length;
    await fn(slice);
    await run();
  };
  return run();
}

function buildBloques(transiciones: TransicionPlan[]): Prisma.RegistroBlockchainCreateManyInput[] {
  const cadenas = new Map<string, { indice: number; hash: string | null }>();
  return transiciones.map((t) => {
    const clave = t.instancia.id!.toString();
    const previo = cadenas.get(clave);
    const indice = previo ? previo.indice + 1 : 0;
    const hashAnterior = previo ? previo.hash : null;
    const payload = buildBlockPayload(indice, t.instancia.id!, {
      idTransicion: t.id!,
      fechaTransicion: t.fechaTransicion,
      datosAdicionales: t.datosAdicionales as any,
    }, hashAnterior);
    const hashDatos = hashPayload(payload);
    cadenas.set(clave, { indice, hash: hashDatos });
    return {
      idInstancia: t.instancia.id!,
      idTransicion: t.id!,
      indice,
      hashDatos,
      hashAnterior,
      payloadCanonico: payload,
      fechaRegistro: t.fechaTransicion,
    };
  });
}

async function flushLotePlan(tx: Tx, planes: LotePlan[]): Promise<void> {
  const unidades: UnidadPlan[] = planes.flatMap((p) => [
    p.unidad,
    ...p.cajas.map((c) => c.unidad),
    ...(p.envio ? [p.envio.unidad] : []),
  ]);

  await tx.unidadTrazable.createMany({
    data: unidades.map((u) => ({
      tipo: u.tipo,
      codigo: u.codigo,
      fechaRegistro: u.fechaRegistro,
    })),
  });
  const codigosUnidad = unidades.map((u) => u.codigo);
  const unidadesBD = await tx.unidadTrazable.findMany({
    where: { codigo: { in: codigosUnidad } },
    select: { idUnidad: true, codigo: true },
  });
  const unidadPorCodigo = new Map(unidadesBD.map((u) => [u.codigo, u.idUnidad]));
  unidades.forEach((u) => {
    u.id = unidadPorCodigo.get(u.codigo);
  });

  await tx.loteProduccion.createMany({
    data: planes.map((p) => ({
      idUnidad: p.unidad.id!,
      idFinca: p.lote.idFinca,
      idVariedad: p.lote.idVariedad,
      codigoLote: p.lote.codigoLote,
      fechaSiembra: p.lote.fechaSiembra,
      fechaEstimadaCosecha: p.lote.fechaEstimadaCosecha,
      fechaCosecha: p.lote.fechaCosecha,
      cantidadPlantas: p.lote.cantidadPlantas,
      pesoCosechadoKg: p.lote.pesoCosechadoKg,
      estado: p.lote.estado,
      fechaRegistro: p.lote.fechaRegistro,
    })),
  });
  const codigosLote = planes.map((p) => p.lote.codigoLote);
  const lotesBD = await tx.loteProduccion.findMany({
    where: { codigoLote: { in: codigosLote } },
    select: { idLote: true, codigoLote: true },
  });
  const lotePorCodigo = new Map(lotesBD.map((l) => [l.codigoLote, l.idLote]));
  planes.forEach((p) => {
    p.idLote = lotePorCodigo.get(p.lote.codigoLote);
  });

  const instancias: InstanciaPlan[] = planes.flatMap((p) => [
    ...(p.instancia ? [p.instancia] : []),
    ...p.cajas.map((c) => c.instancia),
    ...(p.envio ? [p.envio.instancia] : []),
  ]);
  await tx.flujoInstancia.createMany({
    data: instancias.map((i) => ({
      idFlujo: i.idFlujo,
      codigo: i.codigo,
      estado: i.estado,
      fechaInicio: i.fechaInicio,
      fechaRegistro: i.fechaRegistro,
    })),
  });
  const codigosInstancia = instancias.map((i) => i.codigo);
  const instanciasBD = await tx.flujoInstancia.findMany({
    where: { codigo: { in: codigosInstancia } },
    select: { idInstancia: true, codigo: true },
  });
  const instanciaPorCodigo = new Map(instanciasBD.map((i) => [i.codigo, i.idInstancia]));
  instancias.forEach((i) => {
    i.id = instanciaPorCodigo.get(i.codigo);
  });

  await tx.flujoInstanciaUnidad.createMany({
    data: [
      ...planes.flatMap((p) => [
        ...(p.instancia ? [{ idInstancia: p.instancia.id!, idUnidad: p.unidad.id!, rol: RolUnidadFlujo.PRINCIPAL }] : []),
        ...p.cajas.map((c) => ({ idInstancia: c.instancia.id!, idUnidad: c.unidad.id!, rol: RolUnidadFlujo.PRINCIPAL })),
        ...(p.envio ? [{ idInstancia: p.envio.instancia.id!, idUnidad: p.envio.unidad.id!, rol: RolUnidadFlujo.PRINCIPAL }] : []),
      ]),
    ],
  });

  const ejecuciones: EjecucionPlan[] = planes.flatMap((p) => [
    ...p.ejecuciones,
    ...p.cajas.flatMap((c) => c.ejecuciones),
    ...(p.envio ? p.envio.ejecuciones : []),
  ]);
  const ejecucionesUnicas = [
    ...new Map(
      ejecuciones.map((e) => [`${e.instancia.id!}|${e.idFase}|${e.numeroIntento}`, e]),
    ).values(),
  ];
  await tx.faseEjecucion.createMany({
    data: ejecucionesUnicas.map((e) => ({
      idInstancia: e.instancia.id!,
      idFlujo: e.instancia.idFlujo,
      idFase: e.idFase,
      idResponsable: e.idResponsable,
      numeroIntento: e.numeroIntento,
      estado: e.estado,
      datosAdicionales: e.datosAdicionales,
      fechaInicio: e.fechaInicio,
      fechaFin: e.fechaFin,
      fechaRegistro: e.fechaRegistro,
    })),
  });
  const idsInstancia = [...new Set(instancias.map((i) => i.id!))];
  const ejecucionesBD = await tx.faseEjecucion.findMany({
    where: { idInstancia: { in: idsInstancia } },
    select: { idEjecucion: true, idInstancia: true, idFase: true, numeroIntento: true },
  });
  const ejecucionPorClave = new Map(
    ejecucionesBD.map((e) => [
      `${e.idInstancia.toString()}|${e.idFase}|${e.numeroIntento}`,
      e.idEjecucion,
    ]),
  );
  ejecuciones.forEach((e) => {
    e.id = ejecucionPorClave.get(`${e.instancia.id!.toString()}|${e.idFase}|${e.numeroIntento}`);
  });

  const transiciones: TransicionPlan[] = planes.flatMap((p) => [
    ...p.transiciones,
    ...p.cajas.flatMap((c) => c.transiciones),
    ...(p.envio ? p.envio.transiciones : []),
  ]);
  await tx.transicionEjecucion.createMany({
    data: transiciones.map((t) => ({
      idEjecucion: t.ejecucion.id!,
      idUsuario: t.idUsuario,
      estadoAnterior: t.estadoAnterior,
      estadoNuevo: t.estadoNuevo,
      comentario: t.comentario,
      datosAdicionales: t.datosAdicionales,
      fechaTransicion: t.fechaTransicion,
    })),
  });
  const idsEjecucion = ejecuciones.map((e) => e.id!);
  const transicionesBD = await tx.transicionEjecucion.findMany({
    where: { idEjecucion: { in: idsEjecucion } },
    orderBy: { idTransicion: 'asc' },
    select: { idTransicion: true },
  });
  if (transicionesBD.length !== transiciones.length) {
    throw new Error(`Desajuste de transiciones: ${transicionesBD.length} != ${transiciones.length}`);
  }
  transiciones.forEach((t, i) => {
    t.id = transicionesBD[i].idTransicion;
  });

  await tx.registroBlockchain.createMany({ data: buildBloques(transiciones) });

  const cajas = planes.flatMap((p) => p.cajas.map((c) => ({ caja: c, idLote: p.idLote! })));
  await tx.empaque.createMany({
    data: cajas.map(({ caja: c, idLote }) => ({
      idUnidad: c.unidad.id!,
      idEjecucion: c.empaqueEjecucion.id!,
      idLote,
      idCategoriaCalidad: c.empaqueDatos.idCategoriaCalidad,
      codigoCaja: c.empaqueDatos.codigoCaja,
      fechaEmpaque: c.empaqueDatos.fechaEmpaque,
      pesoNetoKg: c.empaqueDatos.pesoNetoKg,
      codigoQr: `QR-${c.empaqueDatos.codigoCaja}`,
      estado: c.empaqueDatos.estado,
    })),
  });
  const codigosCaja = cajas.map((c) => c.caja.empaqueDatos.codigoCaja);
  const empaquesBD = await tx.empaque.findMany({
    where: { codigoCaja: { in: codigosCaja } },
    select: { idEmpaque: true, codigoCaja: true },
  });
  const empaquePorCodigo = new Map(empaquesBD.map((e) => [e.codigoCaja, e.idEmpaque]));
  cajas.forEach((c) => {
    c.caja.idEmpaque = empaquePorCodigo.get(c.caja.empaqueDatos.codigoCaja);
  });

  const envios = planes.flatMap((p) => (p.envio ? [p.envio] : []));
  if (envios.length > 0) {
    await tx.envio.createMany({
      data: envios.map((en) => ({
        idUnidad: en.unidad.id!,
        idEjecucion: en.logisticaEjecucion.id!,
        idNaviera: en.envioDatos.idNaviera,
        idPuertoOrigen: en.envioDatos.idPuertoOrigen,
        idPuertoDestino: en.envioDatos.idPuertoDestino,
        codigoEnvio: en.envioDatos.codigoEnvio,
        numeroContenedor: en.envioDatos.numeroContenedor,
        fechaSalida: en.envioDatos.fechaSalida,
        fechaEstimadaLlegada: en.envioDatos.fechaEstimadaLlegada,
        temperaturaSalida: en.envioDatos.temperaturaSalida,
        estado: en.envioDatos.estado,
      })),
    });
    const codigosEnvio = envios.map((en) => en.envioDatos.codigoEnvio);
    const enviosBD = await tx.envio.findMany({
      where: { codigoEnvio: { in: codigosEnvio } },
      select: { idEnvio: true, codigoEnvio: true },
    });
    const envioPorCodigo = new Map(enviosBD.map((en) => [en.codigoEnvio, en.idEnvio]));
    envios.forEach((en) => {
      en.idEnvio = envioPorCodigo.get(en.envioDatos.codigoEnvio);
    });

    await tx.envioEmpaque.createMany({
      data: envios.flatMap((en) =>
        en.cajas.map((c) => ({ idEnvio: en.idEnvio!, idEmpaque: c.idEmpaque! })),
      ),
    });
  }

  const controles = planes.flatMap((p) => p.controles);
  await tx.controlCalidad.createMany({
    data: controles.map((c) => ({
      idEjecucion: c.ejecucion.id!,
      idLote: planes.find((p) => p.controles.includes(c))!.idLote!,
      idUsuario: c.idUsuario,
      idCategoriaCalidad: c.idCategoriaCalidad,
      fechaControl: c.fechaControl,
      calibreMm: c.calibreMm,
      pesoMuestraKg: c.pesoMuestraKg,
      porcentajeRechazo: c.porcentajeRechazo,
      resultado: c.resultado,
      observaciones: c.observaciones,
    })),
  });

  for (const p of planes) {
    if (!p.eventoExportacion) continue;
    const creado = await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: p.eventoExportacion.unidad.id!,
        idEjecucion: p.eventoExportacion.ejecucion.id!,
        idTipoEvento: p.eventoExportacion.idTipoEvento,
        idUsuario: p.eventoExportacion.idUsuario,
        fechaEvento: p.eventoExportacion.fechaEvento,
        ubicacion: p.eventoExportacion.ubicacion,
        descripcion: p.eventoExportacion.descripcion,
        datosAdicionales: p.eventoExportacion.datosAdicionales,
        fechaRegistro: p.eventoExportacion.fechaRegistro,
      },
      select: { idEvento: true },
    });
    p.eventoExportacion.id = creado.idEvento;
  }

  const eventosBulk = planes.flatMap((p) => [
    ...p.eventosLote,
    ...p.cajas.flatMap((c) => c.eventos),
    ...(p.envio ? p.envio.eventos : []),
  ]);
  await createManyChunked(
    (data) =>
      tx.eventoTrazabilidad.createMany({
        data: data.map((e: EventoPlan) => ({
          idUnidad: e.unidad.id!,
          idEjecucion: e.ejecucion.id!,
          idTipoEvento: e.idTipoEvento,
          idUsuario: e.idUsuario,
          fechaEvento: e.fechaEvento,
          ubicacion: e.ubicacion,
          descripcion: e.descripcion,
          datosAdicionales: e.datosAdicionales,
          fechaRegistro: e.fechaRegistro,
        })),
      }),
    eventosBulk,
    CHUNK_INSERT,
  );

  const documentos = planes.flatMap((p) =>
    p.documentos.map((d) => ({ documento: d, eventoId: p.eventoExportacion!.id! })),
  );
  if (documentos.length > 0) {
    await tx.documentoReferencia.createMany({
      data: documentos.map(({ documento, eventoId }) => ({
        idEvento: eventoId,
        idTipoDocumento: documento.idTipoDocumento,
        nombre: documento.nombre,
        url: documento.url,
        fechaCarga: documento.fechaCarga,
      })),
    });
  }
}

// ---------------------------------------------------------------------------
// Supporting catalogues (productores, fincas, usuarios, certificaciones).
// ---------------------------------------------------------------------------
const PROVINCIAS = [
  {
    region: 'El Oro',
    localidades: ['Machala', 'Pasaje', 'Santa Rosa', 'El Guabo', 'Huaquillas'],
    latMin: -3.8,
    latMax: -3.2,
    lonMin: -80.2,
    lonMax: -79.9,
    peso: 0.3,
  },
  {
    region: 'Guayas',
    localidades: ['Naranjal', 'Milagro', 'El Triunfo', 'Balao', 'Tenguel'],
    latMin: -2.5,
    latMax: -1.8,
    lonMin: -80.2,
    lonMax: -79.7,
    peso: 0.3,
  },
  {
    region: 'Los Ríos',
    localidades: ['Babahoyo', 'Quevedo', 'Vinces', 'Puebloviejo', 'Urdaneta'],
    latMin: -1.9,
    latMax: -1.0,
    lonMin: -79.8,
    lonMax: -79.3,
    peso: 0.25,
  },
  {
    region: 'Santa Elena',
    localidades: ['La Libertad', 'Salinas', 'Santa Elena', 'Manglaralto'],
    latMin: -2.4,
    latMax: -2.0,
    lonMin: -80.8,
    lonMax: -80.4,
    peso: 0.15,
  },
] as const;

const PREFIJOS_SOCIALES = ['Bananera', 'Agroexportadora', 'Hacienda', 'Finca', 'Exportadora', 'Agrícola', 'Plantaciones'] as const;
const SUSTANTIVOS_SOCIALES = ['del Pacífico', 'El Oro', 'San José', 'La Esperanza', 'Los Ríos', 'El Guabo', 'Santa María', 'Machala', 'Tropical', 'Valle Verde', 'La Concordia', 'Las Delicias'] as const;
const TIPOS_SOCIALES = ['S.A.', 'Cía. Ltda.', 'S.A.S.', ''] as const;

function nombreRazonSocial(rng: () => number): string {
  const prefijo = elegir(rng, [...PREFIJOS_SOCIALES]);
  const sustantivo = elegir(rng, [...SUSTANTIVOS_SOCIALES]);
  const tipo = elegir(rng, [...TIPOS_SOCIALES]);
  return `${prefijo} ${sustantivo} ${tipo}`.replace(/\s+/g, ' ').trim();
}

function areaFinca(rng: () => number): number {
  let area = Math.min(60, Math.max(5, Math.exp(normal(rng, Math.log(16), 0.65))));
  if (rng() < 0.032) area = randomEntre(rng, 80, 150);
  return redondear(area, 2);
}

async function sembrarProductoresFincas(prisma: PrismaClient, existentes: number): Promise<Array<{ idFinca: bigint; areaHectareas: number; nombre: string }>> {
  const pendientes = Math.max(0, OBJETIVO_PRODUCTORES - existentes);
  const productores = [];
  for (let i = 0; i < pendientes; i++) {
    const rng = crearPRNG(91_000 + (existentes + i) * 977);
    const identificacion = `${PREFIJO_PRODUCTOR}${String(existentes + i).padStart(8, '0')}`;
    const razonSocial = nombreRazonSocial(rng);
    const provincia = elegir(rng, [...PROVINCIAS]);
    const localidad = elegir(rng, [...provincia.localidades]);
    productores.push({
      identificacion,
      nombreRazonSocial: razonSocial,
      telefono: `09${String(80000000 + (existentes + i) * 7).padStart(8, '0')}`,
      correo: `productor.bi.${existentes + i}@bananotrace.test`,
      direccion: `Km ${enteroEntre(rng, 1, 40)} vía a ${localidad}, provincia de ${provincia.region}`,
    });
  }

  const fincas: Array<{
    idProductor: bigint;
    nombre: string;
    pais: string;
    region: string;
    localidad: string;
    sublocalidad: string | null;
    latitud: number;
    longitud: number;
    areaHectareas: number;
    codigoFinca: string;
  }> = [];
  let creadas = 0;
  const productoresCreados: Array<{ idProductor: bigint }> = [];
  if (productores.length > 0) {
    await prisma.productor.createMany({ data: productores });
    const idsBD = await prisma.productor.findMany({
      where: { identificacion: { in: productores.map((p) => p.identificacion) } },
      select: { idProductor: true, identificacion: true },
    });
    const porIdentificacion = new Map(idsBD.map((p) => [p.identificacion, p.idProductor]));
    productoresCreados.push(...productores.map((p) => ({ idProductor: porIdentificacion.get(p.identificacion)! })));

    let meta = OBJETIVO_FINCAS;
    const rngFincas = crearPRNG(92_500);
    for (const productor of productoresCreados) {
      const numero = meta === OBJETIVO_FINCAS ? 2 + (rngFincas() < 0.5 ? 0 : 1) : Math.min(4, meta);
      for (let f = 0; f < numero && meta > 0; f++) {
        meta -= 1;
        const rngFinca = crearPRNG(93_000 + creadas * 31);
        const prov = elegir(rngFinca, [...PROVINCIAS]);
        const loc = elegir(rngFinca, [...prov.localidades]);
        const anioFinca = elegirAnio(rngFinca, PESOS_ANIO);
        const codigoFinca = correlativos.FINCA.siguiente('FIN', anioFinca);
        const latitud = redondear(prov.latMin + rngFinca() * (prov.latMax - prov.latMin), 6);
        const longitud = redondear(prov.lonMin + rngFinca() * (prov.lonMax - prov.lonMin), 6);
        fincas.push({
          idProductor: productor.idProductor,
          nombre: `Finca ${nombreRazonSocial(rngFinca)} ${f + 1}`,
          pais: 'Ecuador',
          region: prov.region,
          localidad: loc,
          sublocalidad: loc,
          latitud,
          longitud,
          areaHectareas: areaFinca(rngFinca),
          codigoFinca,
        });
        creadas += 1;
      }
    }
  }

  const fincasBD: Array<{ idFinca: bigint; areaHectareas: number; nombre: string }> = [];
  if (fincas.length > 0) {
    await prisma.finca.createMany({ data: fincas });
    const codigos = fincas.map((f) => f.codigoFinca);
    const fincasPorCodigo = new Map(
      (await prisma.finca.findMany({
        where: { codigoFinca: { in: codigos } },
        select: { idFinca: true, codigoFinca: true, areaHectareas: true, nombre: true },
      })).map((f) => [f.codigoFinca, f]),
    );
    for (const f of fincas) {
      const registro = fincasPorCodigo.get(f.codigoFinca)!;
      fincasBD.push({ idFinca: registro.idFinca, areaHectareas: Number(registro.areaHectareas), nombre: registro.nombre });
    }
  }

  console.log(`Productores BI sembrados: ${productores.length}.`);
  console.log(`Fincas BI sembradas: ${creadas}.`);
  return fincasBD;
}

async function sembrarUsuarios(
  prisma: PrismaClient,
  productores: Array<{ idProductor: bigint }>,
  fincas: Array<{ idFinca: bigint }>,
): Promise<{ supervisores: bigint[]; gerentes: bigint[] }> {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const claveHash = await bcrypt.hash('demo12345', saltRounds);
  const usuarios: Array<Prisma.UsuarioCreateManyInput> = [];
  const totalSupervisores = 90;
  const totalGerentes = 60;

  const asignarProductor = (rng: () => number): bigint | null => {
    if (productores.length === 0) return null;
    return productores[Math.floor(rng() * productores.length)].idProductor;
  };

  for (let i = 0; i < totalSupervisores; i++) {
    const rng = crearPRNG(95_000 + i * 131);
    const fecha = fechaCreacionUsuario(rng);
    usuarios.push({
      idRol: ROLE_IDS.SUPERVISOR_AGRICOLA,
      idProductor: asignarProductor(rng),
      nombres: 'Supervisor',
      apellidos: `Bi ${i}`,
      correo: `bi.supervisor.${i}@bananotrace.test`,
      claveHash,
      estado: true,
      fechaCreacion: fecha,
    });
  }
  for (let i = 0; i < totalGerentes; i++) {
    const rng = crearPRNG(96_000 + i * 131);
    const fecha = fechaCreacionUsuario(rng);
    usuarios.push({
      idRol: ROLE_IDS.GERENTE_PRODUCTOR,
      idProductor: asignarProductor(rng),
      nombres: 'Gerente',
      apellidos: `Bi ${i}`,
      correo: `bi.gerente.${i}@bananotrace.test`,
      claveHash,
      estado: true,
      fechaCreacion: fecha,
    });
  }

  await prisma.usuario.createMany({ data: usuarios });
  const correos = usuarios.map((u) => u.correo);
  const usuariosBD = await prisma.usuario.findMany({
    where: { correo: { in: correos } },
    select: { idUsuario: true, correo: true },
  });
  const porCorreo = new Map(usuariosBD.map((u) => [u.correo, u.idUsuario]));
  const supervisores = usuarios
    .filter((u) => u.idRol === ROLE_IDS.SUPERVISOR_AGRICOLA)
    .map((u) => porCorreo.get(u.correo)!);
  const gerentes = usuarios
    .filter((u) => u.idRol === ROLE_IDS.GERENTE_PRODUCTOR)
    .map((u) => porCorreo.get(u.correo)!);

  console.log(`Usuarios BI sembrados: ${usuarios.length} (${supervisores.length} supervisores, ${gerentes.length} gerentes).`);
  return { supervisores, gerentes };
}

function fechaCreacionUsuario(rng: () => number): Date {
  const anio = elegirAnio(rng, PESOS_ANIO);
  const fin = anio >= 2026 ? new Date() : new Date(Date.UTC(anio, 11, 31));
  return fechaEnVentana(rng, new Date(Date.UTC(anio, 0, 1)), fin, { conHora: true });
}

async function sembrarCertificaciones(
  prisma: PrismaClient,
  fincas: Array<{ idFinca: bigint }>,
): Promise<void> {
  const [tipos, entidades] = await Promise.all([
    prisma.tipoCertificacion.findMany({ select: { idTipoCertificacion: true, codigo: true } }),
    prisma.entidadCertificadora.findMany({ select: { idEntidadCertificadora: true } }),
  ]);
  if (tipos.length === 0 || entidades.length === 0) {
    console.log('Sin catálogos de certificación; se omite certificaciones.');
    return;
  }

  const certificaciones: Array<Prisma.CertificacionCreateManyInput> = [];
  const contador = new Map<string, number>();
  for (const finca of fincas) {
    const rng = crearPRNG(97_000 + Number(finca.idFinca) * 13);
    const cantidad = enteroEntre(rng, 5, 8);
    for (let i = 0; i < cantidad; i++) {
      const tipo = elegir(rng, tipos);
      const entidad = elegir(rng, entidades);
      const anio = elegirAnio(rng, PESOS_ANIO);
      const clave = `${tipo.codigo}-${anio}`;
      const secuencia = (contador.get(clave) ?? 0) + 1;
      contador.set(clave, secuencia);
      const numeroCertificado = `BIG-${tipo.codigo}-${anio}-${String(secuencia).padStart(4, '0')}`;
      const finVentana = anio >= 2026 ? new Date() : new Date(Date.UTC(anio, 11, 31));
      const fechaEmision = fechaEnVentana(rng, new Date(Date.UTC(anio, 0, 1)), finVentana, { conHora: false });
      const fechaVencimiento = sumarDias(fechaEmision, enteroEntre(rng, 365, 730));
      certificaciones.push({
        idFinca: finca.idFinca,
        idTipoCertificacion: tipo.idTipoCertificacion,
        idEntidadCertificadora: entidad.idEntidadCertificadora,
        numeroCertificado,
        fechaEmision,
        fechaVencimiento,
        documentoUrl: `https://docs.bananotrace.test/certificados/${numeroCertificado}.pdf`,
      });
    }
  }

  await createManyChunked(
    (data) => prisma.certificacion.createMany({ data }),
    certificaciones,
    CHUNK_INSERT,
  );
  console.log(`Certificaciones BI sembradas: ${certificaciones.length}.`);
}

// ---------------------------------------------------------------------------
// Correlatives sync (codigo_correlativos over the max serial used).
// ---------------------------------------------------------------------------
async function sincronizarCorrelativos(prisma: PrismaClient): Promise<void> {
  const pares: Array<{ entidad: string; anio: number; ultimo: number }> = [];
  for (const [entidad, contador] of Object.entries(correlativos)) {
    for (const anio of [2023, 2024, 2025, 2026]) {
      const maximo = contador.maximo(entidad === 'LOTE' ? 'BAN' : entidad === 'EMPAQUE' ? 'CAJ' : entidad === 'ENVIO' ? 'ENV' : 'FIN', anio);
      if (maximo > 0) pares.push({ entidad, anio, ultimo: maximo });
    }
  }
  if (pares.length === 0) return;

  const placeholders = pares.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
  const valores: Array<string | number> = pares.flatMap((p) => [p.entidad, p.anio, p.ultimo]);
  const sql = `INSERT INTO codigo_correlativos (entidad, anio, ultimo) VALUES ${placeholders}
    ON CONFLICT (entidad, anio) DO UPDATE SET ultimo = GREATEST(codigo_correlativos.ultimo, EXCLUDED.ultimo)`;
  await prisma.$executeRawUnsafe(sql, ...valores);
  console.log(`Correlativos sincronizados: ${pares.length} pares entidad-anio.`);
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
function resolveDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl && !configuredUrl.includes('${')) {
    return configuredUrl;
  }
  const required = ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'POSTGRES_DB'] as const;
  const faltantes = required.filter((variable) => !process.env[variable]);
  if (faltantes.length > 0) {
    throw new Error(`Falta configuración de base de datos: ${faltantes.join(', ')}`);
  }
  const puerto = process.env.POSTGRES_PORT || '5432';
  const usuario = encodeURIComponent(process.env.POSTGRES_USER!);
  const clave = encodeURIComponent(process.env.POSTGRES_PASSWORD!);
  const host = process.env.POSTGRES_HOST!;
  const base = process.env.POSTGRES_DB!;
  return `postgresql://${usuario}:${clave}@${host}:${puerto}/${base}?schema=public`;
}

async function cargarContexto(
  prisma: PrismaClient,
  fincas: Array<{ idFinca: bigint; areaHectareas: number; nombre: string }>,
  usuarios: { supervisores: bigint[]; gerentes: bigint[] },
): Promise<PlanContext> {
  const [principal, empaque, envio, variedades, categorias, navieras, puertos, tiposEvento, tiposDocumento, usuariosOperacion] =
    await Promise.all([
      prisma.flujo.findFirst({
        where: { codigo: 'TRAZABILIDAD_BANANO_EXPORT' },
        select: {
          idFlujo: true,
          fases: { select: { idFase: true, codigo: true }, orderBy: { orden: 'asc' } },
        },
      }),
      prisma.flujo.findFirst({
        where: { codigo: 'EMPAQUE_FLUJO' },
        select: {
          idFlujo: true,
          fases: { select: { idFase: true, codigo: true }, orderBy: { orden: 'asc' } },
        },
      }),
      prisma.flujo.findFirst({
        where: { codigo: 'ENVIO_FLUJO' },
        select: {
          idFlujo: true,
          fases: { select: { idFase: true, codigo: true }, orderBy: { orden: 'asc' } },
        },
      }),
      prisma.variedad.findMany({ select: { idVariedad: true } }),
      prisma.categoriaCalidad.findMany({ select: { idCategoriaCalidad: true } }),
      prisma.naviera.findMany({ where: { activo: true }, select: { idNaviera: true } }),
      prisma.puerto.findMany({ select: { idPuerto: true, paisNombre: true } }),
      prisma.tipoEvento.findMany({ select: { idTipoEvento: true, nombre: true } }),
      prisma.tipoDocumento.findMany({ select: { idTipoDocumento: true, codigo: true } }),
      prisma.usuario.findMany({
        where: { idRol: { in: [ROLE_IDS.CALIDAD, ROLE_IDS.LOGISTICA] } },
        select: { idUsuario: true, idRol: true },
      }),
    ]);

  if (!principal || !empaque || !envio) {
    throw new Error('Flujos requeridos no encontrados (TRAZABILIDAD_BANANO_EXPORT, EMPAQUE_FLUJO, ENVIO_FLUJO)');
  }

  const fase = (flujo: { idFlujo: number; fases: Array<{ idFase: number; codigo: string }> }, codigo: string): number => {
    const encontrada = flujo.fases.find((f) => f.codigo === codigo);
    if (!encontrada) throw new Error(`Fase ${codigo} no encontrada en flujo ${flujo.idFlujo}`);
    return encontrada.idFase;
  };

  const puertosOrigen = puertos.filter((p) => p.paisNombre === 'Ecuador').map((p) => p.idPuerto);
  const puertosDestino = puertos.filter((p) => p.paisNombre !== 'Ecuador').map((p) => p.idPuerto);
  if (puertosOrigen.length === 0 || puertosDestino.length === 0) {
    throw new Error('Se requieren puertos de origen y destino para los envíos');
  }

  const calidad = usuariosOperacion.filter((u) => u.idRol === ROLE_IDS.CALIDAD).map((u) => u.idUsuario);
  const logistica = usuariosOperacion.filter((u) => u.idRol === ROLE_IDS.LOGISTICA).map((u) => u.idUsuario);
  if (calidad.length === 0) console.log('Aviso: sin usuarios de calidad, se usarán supervisores.');
  if (logistica.length === 0) console.log('Aviso: sin usuarios de logística, se usarán supervisores.');

  return {
    idFlujoPrincipal: principal.idFlujo,
    fasesMain: {
      PRODUCCION: fase(principal, 'PRODUCCION'),
      CALIDAD: fase(principal, 'CALIDAD'),
      EMPAQUE: fase(principal, 'EMPAQUE'),
      LOGISTICA: fase(principal, 'LOGISTICA'),
    },
    idFlujoEmpaque: empaque.idFlujo,
    fasesEmpaque: {
      DISPONIBLE: fase(empaque, 'DISPONIBLE'),
      ASIGNADO: fase(empaque, 'ASIGNADO'),
      EN_TRANSITO: fase(empaque, 'EN_TRANSITO'),
      ENTREGADO: fase(empaque, 'ENTREGADO'),
    },
    idFlujoEnvio: envio.idFlujo,
    fasesEnvio: {
      PLANIFICADO: fase(envio, 'PLANIFICADO'),
      CARGADO: fase(envio, 'CARGADO'),
      EN_TRANSITO: fase(envio, 'EN_TRANSITO'),
      ENTREGADO: fase(envio, 'ENTREGADO'),
    },
    variedades: variedades.map((v) => v.idVariedad),
    categorias: categorias.map((c) => c.idCategoriaCalidad),
    navieras: navieras.map((n) => n.idNaviera),
    puertosOrigen,
    puertosDestino,
    tiposEvento: new Map(tiposEvento.map((t) => [t.nombre, t.idTipoEvento])),
    tiposDocumento: new Map(tiposDocumento.map((t) => [t.codigo, t.idTipoDocumento])),
    fincas,
    supervisores: usuarios.supervisores,
    gerentes: usuarios.gerentes,
    calidad: calidad.length > 0 ? calidad : usuarios.supervisores,
    logistica: logistica.length > 0 ? logistica : usuarios.supervisores,
  };
}

async function main(): Promise<void> {
  dotenv.config({ path: path.join(__dirname, '../.env') });
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const inicio = Date.now();
  try {
    const existentes = await prisma.productor.count({
      where: { identificacion: { startsWith: PREFIJO_PRODUCTOR } },
    });
    if (existentes >= OBJETIVO_PRODUCTORES) {
      console.log('ya sembrado');
      return;
    }

    console.log(`Sembrando BI de volumen (existen ${existentes} productores ${PREFIJO_PRODUCTOR}).`);

    const t0 = Date.now();
    const fincas = await sembrarProductoresFincas(prisma, existentes);
    console.log(`Fase productores/fincas en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const t1 = Date.now();
    const usuarios = await sembrarUsuarios(prisma, [], fincas);
    console.log(`Fase usuarios en ${((Date.now() - t1) / 1000).toFixed(1)}s`);

    const t2 = Date.now();
    await sembrarCertificaciones(prisma, fincas);
    console.log(`Fase certificaciones en ${((Date.now() - t2) / 1000).toFixed(1)}s`);

    const t3 = Date.now();
    const ctx = await cargarContexto(prisma, fincas, usuarios);
    console.log(`Fase carga de contexto en ${((Date.now() - t3) / 1000).toFixed(1)}s`);

    const secuenciaEtapas: Etapa[] = [];
    for (const item of DISTRIBUCION_ETAPAS) {
      for (let k = 0; k < item.cantidad; k++) {
        secuenciaEtapas.push(item.etapa);
      }
    }
    const rngShuffle = crearPRNG(0x9e7a11);
    for (let i = secuenciaEtapas.length - 1; i > 0; i--) {
      const j = Math.floor(rngShuffle() * (i + 1));
      [secuenciaEtapas[i], secuenciaEtapas[j]] = [secuenciaEtapas[j], secuenciaEtapas[i]];
    }

    const t4 = Date.now();
    let planificados = 0;
    for (let inicioChunk = 0; inicioChunk < secuenciaEtapas.length; inicioChunk += CHUNK_LOTES) {
      const slice = secuenciaEtapas.slice(inicioChunk, inicioChunk + CHUNK_LOTES);
      const planes: LotePlan[] = slice.map((etapa, i) => {
        const rng = crearPRNG(1_010_000 + (inicioChunk + i) * 7919);
        return planearLote(rng, ctx, etapa, inicioChunk + i);
      });
      await prisma.$transaction(async (tx) => {
        await flushLotePlan(tx, planes);
      }, { timeout: 600_000 });
      planificados += planes.length;
      if (planificados % 1000 === 0) {
        console.log(`Lotes planificados: ${planificados}/${secuenciaEtapas.length} (${((Date.now() - t4) / 1000).toFixed(1)}s)`);
      }
    }
    console.log(`Fase lotes y amplificados en ${((Date.now() - t4) / 1000).toFixed(1)}s`);

    const t5 = Date.now();
    await sincronizarCorrelativos(prisma);
    console.log(`Fase correlativos en ${((Date.now() - t5) / 1000).toFixed(1)}s`);

    console.log(`Total BI sembrado en ${((Date.now() - inicio) / 1000).toFixed(1)}s.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
