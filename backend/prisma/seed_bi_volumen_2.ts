import {
  EstadoEmpaque,
  EstadoEnvio,
  EstadoFlujo,
  Prisma,
  PrismaClient,
  ResultadoControl,
  RolUnidadFlujo,
  TipoUnidadTrazable,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';
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
  elegirAnio,
  elegir,
  elegirPonderado,
  fechaEnVentana,
} from './seeders/helpers/bi-data';

type Tx = Prisma.TransactionClient;

const PREFIJO_PRODUCTOR = '09FIN';
const OBJETIVO_PRODUCTORES = 5_000;
const OBJETIVO_FINCAS = 100_000;
const FINCAS_POR_PRODUCTOR = 20;
const OBJETIVO_CAJAS = 100_000;
const OBJETIVO_ENVIOS = 100_000;
const OBJETIVO_CONTROLES = 100_000;
const OBJETIVO_USUARIOS = 5_000;
const BASE_SERIAL = 200_000;
const CHUNK_FINCAS = 2_000;
const CHUNK_CAJAS = 1_000;
const CHUNK_CONTROLES = 2_000;
const CHUNK_USUARIOS = 1_000;
const CHUNK_CERTIFICACIONES = 2_000;
const CHUNK_INSERT = 2_000;

const PROPORCION_FINCAS_CERTIFICADAS = 0.52;
const FECHA_HOY = new Date(Date.UTC(2026, 7, 3));

const DISTRIBUCION_ROLES = [
  { idRol: ROLE_IDS.SUPERVISOR_AGRICOLA, cantidad: 3_000 },
  { idRol: ROLE_IDS.CALIDAD, cantidad: 750 },
  { idRol: ROLE_IDS.LOGISTICA, cantidad: 750 },
  { idRol: ROLE_IDS.GERENTE_PRODUCTOR, cantidad: 500 },
] as const;

const PROB_RETRY_EMP_FLOW = 0.35;
const PROB_RETRY_ENVIO_FLOW = 0.4;

const PESOS_ANIO = { 2022: 0.1, 2023: 0.15, 2024: 0.25, 2025: 0.25, 2026: 0.25 } as const;

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

interface PasoPlan {
  idFase: number;
  numeroIntento: number;
  idResponsable: bigint | null;
  estadoFinal: EstadoFlujo;
  fechaInicio: Date;
  fechaFin: Date | null;
  datosAdicionales: Prisma.InputJsonValue;
}

interface ControlPlan {
  idEjecucion: bigint;
  idLote: bigint;
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
  idEjecucionEmpaque: bigint;
  idLote: bigint;
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
  fase4: Fase4Lote;
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
  caja: CajaPlan;
  eventos: EventoPlan[];
  documentos: DocumentoPlan[];
}

interface LoteFase3 {
  idLote: bigint;
  idUnidad: bigint;
  codigoLote: string;
  fechaCosecha: Date | null;
  fechaRegistro: Date;
  idFinca: bigint;
  nombreFinca: string;
  idInstancia: bigint;
  idEjecucionFase3: bigint;
  numeroIntentoFase3: number;
}

interface EjecucionFase2Lote {
  idLote: bigint;
  fechaCosecha: Date | null;
  ejecuciones: Array<{
    idEjecucion: bigint;
    idInstancia: bigint;
    fechaInicio: Date | null;
    fechaFin: Date | null;
    idResponsable: bigint | null;
  }>;
}

interface Fase4DB {
  idEjecucion: bigint;
  idInstancia: bigint;
  numeroIntento: number;
  idResponsable: bigint | null;
}

interface Fase4Lote {
  idLote: bigint;
  idInstancia: bigint;
  idEjecucion: bigint | null;
  ejecucionPlan: EjecucionPlan | null;
  transiciones: TransicionPlan[];
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
  supervisores: bigint[];
  gerentes: bigint[];
  calidad: bigint[];
  logistica: bigint[];
}

interface RegionLocalidad {
  region: string;
  localidades: string[];
}

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

  anios(prefijo: string): number[] {
    const set = new Set<number>();
    for (const clave of this.ultimo.keys()) {
      if (clave.startsWith(`${prefijo}-`)) {
        set.add(Number(clave.slice(prefijo.length + 1)));
      }
    }
    return [...set].sort((a, b) => a - b);
  }
}

const correlativos: Record<'FINCA' | 'EMPAQUE' | 'ENVIO', ContadorCodigo> = {
  FINCA: new ContadorCodigo(),
  EMPAQUE: new ContadorCodigo(),
  ENVIO: new ContadorCodigo(),
};

function conHoraLaboral(rng: () => number, fecha: Date): Date {
  const copia = new Date(fecha.getTime());
  copia.setUTCHours(enteroEntre(rng, 6, 20), enteroEntre(rng, 0, 59), 0, 0);
  return copia;
}

function fechaCreacionUsuario(rng: () => number): Date {
  const anio = elegirAnio(rng, PESOS_ANIO);
  const fin = anio >= 2026 ? FECHA_HOY : new Date(Date.UTC(anio, 11, 31));
  return fechaEnVentana(rng, new Date(Date.UTC(anio, 0, 1)), fin, { conHora: true });
}

function numeroContenedor(rng: () => number, anio: number, usados: Set<string>): string {
  let numero = `CONT-${anio}-${String(enteroEntre(rng, 100000, 999999)).padStart(6, '0')}`;
  let reintentos = 0;
  while (usados.has(numero) && reintentos < 200) {
    numero = `CONT-${anio}-${String(enteroEntre(rng, 100000, 999999)).padStart(6, '0')}`;
    reintentos += 1;
  }
  usados.add(numero);
  return numero;
}

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

function pesoNetoCaja(rng: () => number): number {
  let peso = clip(normal(rng, 18.2, 0.47), 17.0, 19.8);
  if (rng() < 0.03) peso = randomEntre(rng, 17.0, 17.3);
  return redondear(peso, 2);
}

function temperaturaSalidaEnvio(rng: () => number, mesSalida: number): number {
  const estacional = 0.6 * Math.sin((2 * Math.PI * (mesSalida - 2)) / 12);
  let temperatura = 13.5 + estacional + normal(rng, 0, 0.6);
  temperatura = clip(temperatura, 12.2, 15.0);
  const roll = rng();
  if (roll < 0.02) temperatura = randomEntre(rng, 12.2, 12.5);
  else if (roll > 0.98) temperatura = randomEntre(rng, 15.0, 15.8);
  return redondear(temperatura, 2);
}

function calibreControl(rng: () => number): number {
  let calibre = clip(normal(rng, 39.5, 2.2), 32, 46);
  const roll = rng();
  if (roll < 0.015) {
    calibre = randomEntre(rng, 28.6, 31.5);
  } else if (roll > 0.985) {
    calibre = randomEntre(rng, 45.5, 47.2);
  }
  return redondear(calibre, 2);
}

function pesoMuestraControl(rng: () => number): number {
  return redondear(clip(normal(rng, 20, 2), 15, 25), 2);
}

function porcentajeYResultado(rng: () => number): { porcentaje: number; resultado: ResultadoControl } {
  const roll = rng();
  let porcentaje: number;
  if (roll < 0.24) {
    porcentaje = randomEntre(rng, 10, 35);
  } else if (roll < 0.36) {
    porcentaje = randomEntre(rng, 5, 10);
  } else {
    porcentaje = clip(normal(rng, 2.2, 1.2), 0.3, 5);
  }
  const resultado =
    porcentaje >= 10 ? ResultadoControl.RECHAZADO : porcentaje >= 5 ? ResultadoControl.OBSERVADO : ResultadoControl.APROBADO;
  return { porcentaje: redondear(porcentaje, 2), resultado };
}

function areaFinca(rng: () => number): number {
  let area = clip(Math.exp(normal(rng, Math.log(26), 0.6)), 10, 80);
  if (rng() < 0.05) area = randomEntre(rng, 120, 400);
  return redondear(area, 2);
}

function estadoEnvioAleatorio(rng: () => number): EstadoEnvio {
  const roll = rng();
  if (roll < 0.08) return EstadoEnvio.PLANIFICADO;
  if (roll < 0.3) return EstadoEnvio.CARGADO;
  if (roll < 0.72) return EstadoEnvio.EN_TRANSITO;
  return EstadoEnvio.ENTREGADO;
}

function nPasosCajaPara(estado: EstadoEnvio): number {
  if (estado === EstadoEnvio.ENTREGADO) return 4;
  if (estado === EstadoEnvio.EN_TRANSITO || estado === EstadoEnvio.CARGADO) return 3;
  return 2;
}

const PASOS_ENVIO_POR_ESTADO: Record<EstadoEnvio, number> = {
  PLANIFICADO: 1,
  CARGADO: 2,
  EN_TRANSITO: 3,
  ENTREGADO: 4,
  CANCELADO: 1,
};

const PREFIJOS_SOCIALES = ['Bananera', 'Agroexportadora', 'Hacienda', 'Finca', 'Exportadora', 'Agrícola', 'Plantaciones'] as const;
const SUSTANTIVOS_SOCIALES = ['del Pacífico', 'El Oro', 'San José', 'La Esperanza', 'Los Ríos', 'El Guabo', 'Santa María', 'Machala', 'Tropical', 'Valle Verde', 'La Concordia', 'Las Delicias'] as const;
const TIPOS_SOCIALES = ['S.A.', 'Cía. Ltda.', 'S.A.S.', ''] as const;

const APELLIDOS: string[] = [
  'Rivadeneira', 'Zambrano', 'Macías', 'Alvarado', 'Pincay', 'Vera', 'Cedeño', 'Mendoza', 'Guerrero',
  'Salazar', 'Intriago', 'Bravo', 'Delgado', 'Palacios', 'Quintero', 'Hidalgo', 'Noboa', 'Álava',
  'Cevallos', 'Rentería',
];

const NOMBRES: string[] = [
  'Carlos', 'María', 'José', 'Ana', 'Luis', 'Carmen', 'Jorge', 'Mónica', 'Pedro', 'Lucía',
  'Daniel', 'Paola', 'Miguel', 'Sandra', 'Andrés', 'Verónica', 'Ricardo', 'Patricia', 'Fernando', 'Gabriela',
];

const REGIONES: RegionLocalidad[] = [
  { region: 'Guayas', localidades: ['El Triunfo', 'La Troncal', 'Naranjal', 'Milagro', 'Tenguel'] },
  { region: 'El Oro', localidades: ['Machala', 'Pasaje', 'Santa Rosa', 'El Guabo', 'Huaquillas'] },
  { region: 'Los Ríos', localidades: ['Quevedo', 'Babahoyo', 'Vinces', 'Puebloviejo', 'Urdaneta'] },
  { region: 'Manabí', localidades: ['Santa Elena', 'La Concordia', 'Chone', 'El Carmen', 'Tosagua'] },
];

function nombreRazonSocial(rng: () => number): string {
  const prefijo = elegir(rng, [...PREFIJOS_SOCIALES]);
  const sustantivo = elegir(rng, [...SUSTANTIVOS_SOCIALES]);
  const tipo = elegir(rng, [...TIPOS_SOCIALES]);
  return `${prefijo} ${sustantivo} ${tipo}`.replace(/\s+/g, ' ').trim();
}

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

function transicionesDePasos(
  rng: () => number,
  instancia: InstanciaPlan,
  pasos: PasoPlan[],
  ejecuciones: EjecucionPlan[] = ejecucionesDePasos(instancia, pasos),
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

  // La ejecución ACTIVA (EN_PROCESO/PENDIENTE) no lleva transición ni bloque:
  // los genera la app cuando avanza la fase. Solo la historia completada
  // (COMPLETADO/RECHAZADO) lleva transiciones y bloques.
  const transiciones: TransicionPlan[] = [];
  pasos.forEach((paso, i) => {
    const esActiva =
      paso.estadoFinal === EstadoFlujo.EN_PROCESO || paso.estadoFinal === EstadoFlujo.PENDIENTE;
    if (i === 0) {
      if (!esActiva) {
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
      }
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
      if (!esActiva) {
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

function eventosCaja(
  rng: () => number,
  ctx: PlanContext,
  caja: CajaPlan,
  nombreFinca: string,
  fechaInicio: Date,
  fechaFin: Date,
  idUsuario: bigint,
  contenedor: string,
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
  const cantidad = enteroEntre(rng, 2, 4);
  const ejecuciones = caja.ejecuciones;

  for (let i = 0; i < cantidad; i++) {
    const t = Math.min(
      fechaFin.getTime(),
      Math.max(
        fechaInicio.getTime(),
        fechaInicio.getTime() + (fechaFin.getTime() - fechaInicio.getTime()) * (rng() * 0.9 + 0.05),
      ),
    );
    const fecha = new Date(t);
    const ejecucion = ejecuciones[Math.min(i % ejecuciones.length, ejecuciones.length - 1)];
    const esEmpaque = i % 2 === 0;
    const idTipoEvento = esEmpaque ? ctx.tiposEvento.get('EMPACADO') : ctx.tiposEvento.get('TRANSPORTE');
    if (!idTipoEvento || !ejecucion) continue;
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
        : { contenedor, responsable: 'Jefe de logística' },
      fechaRegistro: fecha,
    });
  }
  return eventos;
}

function eventosEnvio(
  rng: () => number,
  ctx: PlanContext,
  envio: EnvioPlan,
  fechaSalida: Date,
  fechaLlegada: Date,
): EventoPlan[] {
  const eventos: EventoPlan[] = [];
  const ejecuciones = envio.ejecuciones;
  const idUsuario = ctx.logistica[0];

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

  const nPings = enteroEntre(rng, 2, 3);
  for (let i = 0; i < nPings; i++) {
    const t = fechaSalida.getTime() + (fechaLlegada.getTime() - fechaSalida.getTime()) * rng();
    const lat = latInicio + (latFin - latInicio) * rng();
    const lon = lonInicio + (lonFin - lonInicio) * rng();
    agregarGps(new Date(t), lat, lon, 'Monitoreo satelital del contenedor');
  }
  return eventos;
}

function documentosEnvio(rng: () => number, ctx: PlanContext, envio: EnvioPlan): DocumentoPlan[] {
  const tipos = ctx.tiposDocumento;
  const { codigoEnvio, numeroContenedor } = envio.envioDatos;
  const anio = envio.envioDatos.fechaSalida.getUTCFullYear();
  const candidatos: DocumentoPlan[] = [];

  const factura = tipos.get('FACTURA');
  if (factura) {
    candidatos.push({
      idTipoDocumento: factura,
      nombre: `Factura comercial ${codigoEnvio}`,
      url: `/docs/${anio}/factura/${codigoEnvio}.pdf`,
      fechaCarga: envio.eventos[0].fechaEvento,
    });
  }
  const embarque = tipos.get('CONOCIMIENTO_EMBARQUE');
  if (embarque) {
    candidatos.push({
      idTipoDocumento: embarque,
      nombre: `Bill of lading ${numeroContenedor}`,
      url: `/docs/${anio}/conocimiento_embarque/${numeroContenedor}.pdf`,
      fechaCarga: envio.eventos[0].fechaEvento,
    });
  }
  const guia = tipos.get('GUIA_REMISION');
  if (guia) {
    candidatos.push({
      idTipoDocumento: guia,
      nombre: `Packing list ${codigoEnvio}`,
      url: `/docs/${anio}/packing_list/${codigoEnvio}.pdf`,
      fechaCarga: envio.eventos[0].fechaEvento,
    });
  }
  const certificado = tipos.get('CERTIFICADO');
  if (certificado) {
    candidatos.push({
      idTipoDocumento: certificado,
      nombre: `Certificado fitosanitario ${codigoEnvio}`,
      url: `/docs/${anio}/certificado_fitosanitario/${codigoEnvio}.pdf`,
      fechaCarga: envio.eventos[0].fechaEvento,
    });
  }
  const laboratorio = tipos.get('INFORME_LABORATORIO');
  if (laboratorio) {
    candidatos.push({
      idTipoDocumento: laboratorio,
      nombre: `Informe de laboratorio ${codigoEnvio}`,
      url: `/docs/${anio}/informe_laboratorio/${codigoEnvio}.pdf`,
      fechaCarga: envio.eventos[0].fechaEvento,
    });
  }

  const cantidad = rng() < 0.25 ? 3 : 2;
  for (let i = candidatos.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidatos[i], candidatos[j]] = [candidatos[j], candidatos[i]];
  }
  const resultado: DocumentoPlan[] = [];
  for (let i = 0; i < cantidad && i < candidatos.length; i++) {
    const evento = envio.eventos[Math.min(i, envio.eventos.length - 1)];
    resultado.push({ ...candidatos[i], fechaCarga: evento.fechaEvento });
  }
  return resultado;
}

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
    const payload = buildBlockPayload(
      indice,
      t.instancia.id!,
      {
        idTransicion: t.id!,
        fechaTransicion: t.fechaTransicion,
        datosAdicionales: t.datosAdicionales as Prisma.JsonValue,
      },
      hashAnterior,
    );
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

function construirFase4Lote(
  rng: () => number,
  ctx: PlanContext,
  lote: LoteFase3,
  db: Fase4DB | undefined,
  fechaSalida: Date,
): Fase4Lote {
  if (db) {
    return {
      idLote: lote.idLote,
      idInstancia: lote.idInstancia,
      idEjecucion: db.idEjecucion,
      ejecucionPlan: null,
      transiciones: [],
    };
  }
  const instancia: InstanciaPlan = {
    codigo: `FLW-BIG2-L-${lote.idInstancia.toString()}`,
    idFlujo: ctx.idFlujoPrincipal,
    estado: EstadoFlujo.COMPLETADO,
    fechaInicio: lote.fechaCosecha ?? lote.fechaRegistro,
    fechaRegistro: lote.fechaCosecha ?? lote.fechaRegistro,
    id: lote.idInstancia,
  };
  const pasos: PasoPlan[] = [
    {
      idFase: ctx.fasesMain.LOGISTICA,
      numeroIntento: 1,
      idResponsable: elegir(rng, ctx.logistica),
      estadoFinal: EstadoFlujo.COMPLETADO,
      fechaInicio: conHoraLaboral(rng, fechaSalida),
      fechaFin: conHoraLaboral(rng, sumarDias(fechaSalida, enteroEntre(rng, 3, 8))),
      datosAdicionales: { actividad: 'Exportación', responsable: 'Jefe de logística' },
    },
  ];
  const transiciones = transicionesDePasos(rng, instancia, pasos);
  return {
    idLote: lote.idLote,
    idInstancia: lote.idInstancia,
    idEjecucion: null,
    ejecucionPlan: transiciones[0].ejecucion,
    transiciones,
  };
}

function planearCajaEnvio(
  rng: () => number,
  ctx: PlanContext,
  lote: LoteFase3,
  dbFase4: Fase4DB | undefined,
  fase4Chunk: Map<bigint, Fase4Lote>,
  usadosContenedores: Set<string>,
): { caja: CajaPlan; envio: EnvioPlan } {
  const estadoEnvio = estadoEnvioAleatorio(rng);
  const fechaEmpaque = conHoraLaboral(rng, sumarDias(lote.fechaCosecha ?? lote.fechaRegistro, enteroEntre(rng, 1, 5)));
  const fechaSalida = conHoraLaboral(rng, sumarDias(fechaEmpaque, enteroEntre(rng, 1, 7)));
  const fechaEstimadaLlegada = conHoraLaboral(rng, sumarDias(fechaSalida, enteroEntre(rng, 10, 18)));

  const codigoCaja = correlativos.EMPAQUE.siguiente('CAJ', fechaEmpaque.getUTCFullYear());
  const anioSalida = fechaSalida.getUTCFullYear();
  const codigoEnvio = correlativos.ENVIO.siguiente('ENV', anioSalida);

  const idUsuarioLogistica = elegir(rng, ctx.logistica);
  const estadosEmpaque = [EstadoEmpaque.DISPONIBLE, EstadoEmpaque.ASIGNADO, EstadoEmpaque.EN_TRANSITO, EstadoEmpaque.ENTREGADO];
  const fasesCaja = [ctx.fasesEmpaque.DISPONIBLE, ctx.fasesEmpaque.ASIGNADO, ctx.fasesEmpaque.EN_TRANSITO, ctx.fasesEmpaque.ENTREGADO];
  const nPasosCaja = nPasosCajaPara(estadoEnvio);
  const diasASalida = Math.max(1, Math.round((fechaSalida.getTime() - fechaEmpaque.getTime()) / 86_400_000));

  const pasosCaja: PasoPlan[] = [];
  for (let s = 0; s < nPasosCaja; s++) {
    const esUltimo = s === nPasosCaja - 1;
    const esTerminal = nPasosCaja === 4;
    const fechaInicioPaso =
      s === 0
        ? fechaEmpaque
        : s === 1
          ? sumarDias(fechaEmpaque, enteroEntre(rng, 0, diasASalida))
          : s === 2
            ? sumarDias(fechaSalida, enteroEntre(rng, 0, 1))
            : sumarDias(fechaSalida, enteroEntre(rng, 5, 9));
    const fechaFinPaso = esUltimo
      ? nPasosCaja === 4
        ? fechaEstimadaLlegada
        : nPasosCaja === 3
          ? sumarDias(fechaSalida, enteroEntre(rng, 2, 5))
          : sumarDias(fechaSalida, 0)
      : null;
    pasosCaja.push(
      ...intentosFase(rng, {
        idFase: fasesCaja[s],
        idResponsable: idUsuarioLogistica,
        fechaInicio: fechaInicioPaso,
        fechaFin: fechaFinPaso,
        estadoFinal: esUltimo && !esTerminal ? EstadoFlujo.EN_PROCESO : EstadoFlujo.COMPLETADO,
        probRetry: esUltimo && esTerminal ? PROB_RETRY_EMP_FLOW : 0,
        probRetryExtra: 0,
        datos: { actividad: 'Avance de caja', responsable: 'Jefe de logística' },
      }),
    );
  }

  const instanciaCaja: InstanciaPlan = {
    codigo: `FLW-BIG2-E-${codigoCaja}`,
    idFlujo: ctx.idFlujoEmpaque,
    estado: nPasosCaja === 4 ? EstadoFlujo.COMPLETADO : EstadoFlujo.EN_PROCESO,
    fechaInicio: fechaEmpaque,
    fechaRegistro: fechaEmpaque,
  };
  const ejecucionesCaja = ejecucionesDePasos(instanciaCaja, pasosCaja);
  const transicionesCaja = transicionesDePasos(rng, instanciaCaja, pasosCaja, ejecucionesCaja);

  const caja: CajaPlan = {
    unidad: { tipo: TipoUnidadTrazable.EMPAQUE, codigo: codigoCaja, fechaRegistro: fechaEmpaque },
    instancia: instanciaCaja,
    ejecuciones: ejecucionesCaja,
    transiciones: transicionesCaja,
    idEjecucionEmpaque: lote.idEjecucionFase3,
    idLote: lote.idLote,
    empaqueDatos: {
      idCategoriaCalidad: elegir(rng, ctx.categorias),
      codigoCaja,
      fechaEmpaque,
      pesoNetoKg: pesoNetoCaja(rng),
      estado: estadosEmpaque[nPasosCaja - 1],
    },
    eventos: [],
  };

  let fase4 = fase4Chunk.get(lote.idLote);
  if (!fase4) {
    fase4 = construirFase4Lote(rng, ctx, lote, dbFase4, fechaSalida);
    fase4Chunk.set(lote.idLote, fase4);
  }

  const nPasosEnvio = PASOS_ENVIO_POR_ESTADO[estadoEnvio];
  const fasesEnvio = [ctx.fasesEnvio.PLANIFICADO, ctx.fasesEnvio.CARGADO, ctx.fasesEnvio.EN_TRANSITO, ctx.fasesEnvio.ENTREGADO];
  const pasosEnvio: PasoPlan[] = [];
  for (let s = 0; s < nPasosEnvio; s++) {
    const esUltimo = s === nPasosEnvio - 1;
    const esTerminal = nPasosEnvio === 4 || estadoEnvio === EstadoEnvio.CANCELADO;
    const fechaInicioPaso =
      s === 0
        ? fechaSalida
        : s === 1
          ? sumarDias(fechaSalida, enteroEntre(rng, 0, 1))
          : s === 2
            ? sumarDias(fechaSalida, enteroEntre(rng, 1, 2))
            : sumarDias(fechaEstimadaLlegada, enteroEntre(rng, -1, 0));
    const fechaFinPaso = esUltimo
      ? nPasosEnvio === 4
        ? fechaEstimadaLlegada
        : nPasosEnvio === 3
          ? sumarDias(fechaSalida, enteroEntre(rng, 2, 6))
          : nPasosEnvio === 2
            ? fechaSalida
            : null
      : null;
    pasosEnvio.push(
      ...intentosFase(rng, {
        idFase: fasesEnvio[s],
        idResponsable: idUsuarioLogistica,
        fechaInicio: fechaInicioPaso,
        fechaFin: fechaFinPaso,
        estadoFinal: esUltimo && !esTerminal ? EstadoFlujo.EN_PROCESO : EstadoFlujo.COMPLETADO,
        probRetry: esUltimo && esTerminal ? PROB_RETRY_ENVIO_FLOW : 0,
        probRetryExtra: 0,
        datos: { actividad: 'Avance de envío', responsable: 'Jefe de logística' },
      }),
    );
  }

  const instanciaEnvio: InstanciaPlan = {
    codigo: `FLW-BIG2-S-${codigoEnvio}`,
    idFlujo: ctx.idFlujoEnvio,
    estado: estadoEnvio === EstadoEnvio.ENTREGADO ? EstadoFlujo.COMPLETADO : EstadoFlujo.EN_PROCESO,
    fechaInicio: fechaSalida,
    fechaRegistro: fechaSalida,
  };
  const ejecucionesEnvio = ejecucionesDePasos(instanciaEnvio, pasosEnvio);
  const transicionesEnvio = transicionesDePasos(rng, instanciaEnvio, pasosEnvio, ejecucionesEnvio);

  const numeroCont = numeroContenedor(rng, anioSalida, usadosContenedores);

  const envio: EnvioPlan = {
    unidad: { tipo: TipoUnidadTrazable.ENVIO, codigo: codigoEnvio, fechaRegistro: fechaSalida },
    instancia: instanciaEnvio,
    ejecuciones: ejecucionesEnvio,
    transiciones: transicionesEnvio,
    fase4,
    envioDatos: {
      idNaviera: elegir(rng, ctx.navieras),
      idPuertoOrigen: elegir(rng, ctx.puertosOrigen),
      idPuertoDestino: elegir(rng, ctx.puertosDestino),
      codigoEnvio,
      numeroContenedor: numeroCont,
      fechaSalida,
      fechaEstimadaLlegada,
      temperaturaSalida: temperaturaSalidaEnvio(rng, fechaSalida.getUTCMonth()),
      estado: estadoEnvio,
    },
    caja,
    eventos: [],
    documentos: [],
  };

  const fechaFinEventos =
    estadoEnvio === EstadoEnvio.ENTREGADO
      ? fechaEstimadaLlegada
      : estadoEnvio === EstadoEnvio.EN_TRANSITO
        ? sumarDias(fechaSalida, enteroEntre(rng, 2, 5))
        : estadoEnvio === EstadoEnvio.CARGADO
          ? fechaSalida
          : sumarDias(fechaEmpaque, 1);

  envio.eventos = eventosEnvio(rng, ctx, envio, fechaSalida, fechaEstimadaLlegada);
  caja.eventos = eventosCaja(rng, ctx, caja, lote.nombreFinca, fechaEmpaque, fechaFinEventos, idUsuarioLogistica, numeroCont);
  envio.documentos = documentosEnvio(rng, ctx, envio);

  return { caja, envio };
}

function fechaControlEnVentana(rng: () => number, inicio: Date | null, fin: Date | null, fallback: Date): Date {
  const a = inicio ?? fallback;
  const b = fin ?? fallback;
  const min = a.getTime() <= b.getTime() ? a.getTime() : b.getTime();
  const max = a.getTime() <= b.getTime() ? b.getTime() : a.getTime();
  for (let i = 0; i < 8; i++) {
    const t = min + (max - min) * rng();
    const fecha = new Date(t);
    if (rng() < factorMes(fecha.getUTCMonth()) / 1.25) return conHoraLaboral(rng, fecha);
  }
  const t = min + (max - min) * rng();
  return conHoraLaboral(rng, new Date(t));
}

function planearControl(rng: () => number, ctx: PlanContext, indice: number, lotes: EjecucionFase2Lote[]): ControlPlan {
  const lote = lotes[indice % lotes.length];
  const posicion = Math.floor(indice / lotes.length);
  const ejecucion = lote.ejecuciones[posicion % lote.ejecuciones.length];
  const { porcentaje, resultado } = porcentajeYResultado(rng);
  return {
    idEjecucion: ejecucion.idEjecucion,
    idLote: lote.idLote,
    idUsuario: elegir(rng, ctx.calidad),
    idCategoriaCalidad: elegir(rng, ctx.categorias),
    fechaControl: fechaControlEnVentana(
      rng,
      ejecucion.fechaInicio,
      ejecucion.fechaFin ?? lote.fechaCosecha,
      lote.fechaCosecha ?? new Date(Date.UTC(2024, 0, 15)),
    ),
    calibreMm: calibreControl(rng),
    pesoMuestraKg: pesoMuestraControl(rng),
    porcentajeRechazo: porcentaje,
    resultado,
    observaciones: observar(rng, resultado),
  };
}

async function sembrarProductoresFincas(
  prisma: PrismaClient,
  existentes: number,
): Promise<{
  productores: number;
  fincas: number;
  productoresCreados: Array<{ idProductor: bigint }>;
  fincasCreadas: Array<{ idFinca: bigint }>;
}> {
  const pendientes = Math.max(0, OBJETIVO_PRODUCTORES - existentes);
  const productores: Prisma.ProductorCreateManyInput[] = [];
  for (let i = 0; i < pendientes; i++) {
    const rng = crearPRNG(2_100_000 + (existentes + i) * 977);
    const identificacion = `${PREFIJO_PRODUCTOR}${String(existentes + i).padStart(8, '0')}`;
    const provincia = elegir(rng, REGIONES);
    productores.push({
      identificacion,
      // nombreRazonSocial() solo tiene 336 combinaciones posibles; con 5000 productores
      // objetivo, cada nombre se repetiría en promedio ~15 veces, así que se agrega un
      // índice global único en vez de confiar en el sorteo.
      nombreRazonSocial: `${nombreRazonSocial(rng)} ${existentes + i + 1}`,
      telefono: rng() < 0.6 ? `09${String(9_0000000 + (existentes + i) * 13).padStart(8, '0')}` : null,
      correo: `productor.fin.${existentes + i}@bananotrace.test`,
      direccion: rng() < 0.6 ? `Vía a ${elegir(rng, provincia.localidades)}, provincia de ${provincia.region}` : null,
    });
  }

  const productoresCreados: Array<{ idProductor: bigint }> = [];
  if (productores.length > 0) {
    await prisma.productor.createMany({ data: productores });
    const idsBD = await prisma.productor.findMany({
      where: { identificacion: { in: productores.map((p) => p.identificacion) } },
      select: { idProductor: true, identificacion: true },
    });
    const porIdentificacion = new Map(idsBD.map((p) => [p.identificacion, p.idProductor]));
    productoresCreados.push(...productores.map((p) => ({ idProductor: porIdentificacion.get(p.identificacion)! })));
  }

  const fincas: Prisma.FincaCreateManyInput[] = [];
  let creadas = 0;
  for (const productor of productoresCreados) {
    const rngProductor = crearPRNG(2_150_000 + Number(productor.idProductor) * 31);
    const apellido = elegir(rngProductor, APELLIDOS);
    for (let f = 0; f < FINCAS_POR_PRODUCTOR; f++) {
      const rngFinca = crearPRNG(2_160_000 + creadas * 31);
      const prov = elegir(rngFinca, REGIONES);
      const loc = elegir(rngFinca, prov.localidades);
      const anioFinca = elegirAnio(rngFinca, PESOS_ANIO);
      const codigoFinca = correlativos.FINCA.siguiente('FIN', anioFinca);
      fincas.push({
        idProductor: productor.idProductor,
        // `apellido` sale de una lista de 20 y `f + 1` solo es único dentro de las
        // fincas de UN productor: con 5000 productores compartiendo esos 20 apellidos,
        // el mismo nombre "Finca X N" se repite ~250 veces en promedio. `creadas` es
        // el contador global de fincas de esta corrida, así que sí es único por finca.
        nombre: `Finca ${apellido} ${creadas + 1}`,
        pais: 'Ecuador',
        region: prov.region,
        localidad: loc,
        sublocalidad: null,
        latitud: redondear(-1.5 + rngFinca() * -2.0, 6),
        longitud: redondear(-79.5 + rngFinca() * -1.0, 6),
        areaHectareas: areaFinca(rngFinca),
        codigoFinca,
      });
      creadas += 1;
    }
  }

  if (fincas.length > 0) {
    await createManyChunked((data) => prisma.finca.createMany({ data }), fincas, CHUNK_FINCAS);
  }
  const fincasCreadas: Array<{ idFinca: bigint }> = [];
  if (productoresCreados.length > 0) {
    const fincasBD = await prisma.finca.findMany({
      where: { idProductor: { in: productoresCreados.map((p) => p.idProductor) } },
      select: { idFinca: true },
    });
    fincasCreadas.push(...fincasBD);
  }
  console.log(`Productores ${PREFIJO_PRODUCTOR} sembrados: ${productores.length}.`);
  console.log(`Fincas ${PREFIJO_PRODUCTOR} sembradas: ${creadas}.`);
  return { productores: productores.length, fincas: creadas, productoresCreados, fincasCreadas };
}

async function cargarContexto(prisma: PrismaClient): Promise<PlanContext> {
  const [principal, empaque, envio, variedades, categorias, navieras, puertos, tiposEvento, tiposDocumento, usuariosOperacion, supervisores, gerentes] =
    await Promise.all([
      prisma.flujo.findFirst({
        where: { codigo: 'TRAZABILIDAD_BANANO_EXPORT' },
        select: { idFlujo: true, fases: { select: { idFase: true, codigo: true }, orderBy: { orden: 'asc' } } },
      }),
      prisma.flujo.findFirst({
        where: { codigo: 'EMPAQUE_FLUJO' },
        select: { idFlujo: true, fases: { select: { idFase: true, codigo: true }, orderBy: { orden: 'asc' } } },
      }),
      prisma.flujo.findFirst({
        where: { codigo: 'ENVIO_FLUJO' },
        select: { idFlujo: true, fases: { select: { idFase: true, codigo: true }, orderBy: { orden: 'asc' } } },
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
      prisma.usuario.findMany({ where: { idRol: ROLE_IDS.SUPERVISOR_AGRICOLA }, select: { idUsuario: true } }),
      prisma.usuario.findMany({ where: { idRol: ROLE_IDS.GERENTE_PRODUCTOR }, select: { idUsuario: true } }),
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
  const supervisoresIds = supervisores.map((u) => u.idUsuario);
  const gerentesIds = gerentes.map((u) => u.idUsuario);
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
    supervisores: supervisoresIds,
    gerentes: gerentesIds,
    calidad: calidad.length > 0 ? calidad : supervisoresIds,
    logistica: logistica.length > 0 ? logistica : supervisoresIds,
  };
}

async function cargarLotesBase(
  prisma: PrismaClient,
  ctx: PlanContext,
): Promise<{ lotesFase3: LoteFase3[]; lotesFase2: EjecucionFase2Lote[]; lotePorInstancia: Map<bigint, bigint> }> {
  const [fase3, fase2] = await Promise.all([
    prisma.faseEjecucion.findMany({
      where: {
        idFlujo: ctx.idFlujoPrincipal,
        idFase: ctx.fasesMain.EMPAQUE,
        instancia: { unidades: { some: { unidad: { lote: { isNot: null } } } } },
      },
      select: {
        idEjecucion: true,
        numeroIntento: true,
        instancia: {
          select: {
            idInstancia: true,
            unidades: {
              where: { rol: RolUnidadFlujo.PRINCIPAL },
              select: {
                unidad: {
                  select: {
                    idUnidad: true,
                    lote: {
                      select: {
                        idLote: true,
                        codigoLote: true,
                        fechaCosecha: true,
                        fechaRegistro: true,
                        idFinca: true,
                        finca: { select: { nombre: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.faseEjecucion.findMany({
      where: {
        idFlujo: ctx.idFlujoPrincipal,
        idFase: ctx.fasesMain.CALIDAD,
        instancia: { unidades: { some: { unidad: { lote: { isNot: null } } } } },
      },
      select: {
        idEjecucion: true,
        idInstancia: true,
        idResponsable: true,
        fechaInicio: true,
        fechaFin: true,
        instancia: {
          select: {
            unidades: {
              where: { rol: RolUnidadFlujo.PRINCIPAL },
              select: {
                unidad: {
                  select: {
                    lote: { select: { idLote: true, fechaCosecha: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const porLote = new Map<bigint, LoteFase3>();
  for (const fe of fase3) {
    const lote = fe.instancia.unidades[0]?.unidad.lote;
    if (!lote) continue;
    const previo = porLote.get(lote.idLote);
    if (previo && fe.numeroIntento <= previo.numeroIntentoFase3) continue;
    porLote.set(lote.idLote, {
      idLote: lote.idLote,
      idUnidad: fe.instancia.unidades[0]!.unidad.idUnidad,
      codigoLote: lote.codigoLote,
      fechaCosecha: lote.fechaCosecha,
      fechaRegistro: lote.fechaRegistro,
      idFinca: lote.idFinca,
      nombreFinca: lote.finca.nombre,
      idInstancia: fe.instancia.idInstancia,
      idEjecucionFase3: fe.idEjecucion,
      numeroIntentoFase3: fe.numeroIntento,
    });
  }

  const porLote2 = new Map<bigint, EjecucionFase2Lote>();
  for (const fe of fase2) {
    const lote = fe.instancia.unidades[0]?.unidad.lote;
    if (!lote) continue;
    let entrada = porLote2.get(lote.idLote);
    if (!entrada) {
      entrada = { idLote: lote.idLote, fechaCosecha: lote.fechaCosecha, ejecuciones: [] };
      porLote2.set(lote.idLote, entrada);
    }
    entrada.ejecuciones.push({
      idEjecucion: fe.idEjecucion,
      idInstancia: fe.idInstancia,
      fechaInicio: fe.fechaInicio,
      fechaFin: fe.fechaFin,
      idResponsable: fe.idResponsable,
    });
  }

  const lotesFase3 = [...porLote.values()].sort((a, b) => Number(a.idLote - b.idLote));
  const lotesFase2 = [...porLote2.values()].sort((a, b) => Number(a.idLote - b.idLote));
  for (const l of lotesFase2) l.ejecuciones.sort((a, b) => Number(a.idEjecucion - b.idEjecucion));
  const lotePorInstancia = new Map(lotesFase3.map((l) => [l.idInstancia, l.idLote]));
  return { lotesFase3, lotesFase2, lotePorInstancia };
}

async function consultarFase4PorLotes(
  prisma: PrismaClient,
  ctx: PlanContext,
  idLotes: Set<bigint>,
  lotePorInstancia: Map<bigint, bigint>,
): Promise<Map<bigint, Fase4DB>> {
  const mapa = new Map<bigint, Fase4DB>();
  if (idLotes.size === 0) return mapa;
  const rows = await prisma.faseEjecucion.findMany({
    where: {
      idFlujo: ctx.idFlujoPrincipal,
      idFase: ctx.fasesMain.LOGISTICA,
      instancia: { unidades: { some: { unidad: { lote: { idLote: { in: [...idLotes] } } } } } },
    },
    select: { idEjecucion: true, idInstancia: true, numeroIntento: true, idResponsable: true },
  });
  for (const r of rows) {
    const idLote = lotePorInstancia.get(r.idInstancia);
    if (idLote === undefined || !idLotes.has(idLote)) continue;
    const previo = mapa.get(idLote);
    if (previo && previo.numeroIntento >= r.numeroIntento) continue;
    mapa.set(idLote, {
      idEjecucion: r.idEjecucion,
      idInstancia: r.idInstancia,
      numeroIntento: r.numeroIntento,
      idResponsable: r.idResponsable,
    });
  }
  return mapa;
}

async function flushCajasEnvios(
  tx: Tx,
  planes: Array<{ caja: CajaPlan; envio: EnvioPlan }>,
  fase4Nuevas: Fase4Lote[],
): Promise<void> {
  const cajas = planes.map((p) => p.caja);
  const envios = planes.map((p) => p.envio);

  const unidades: UnidadPlan[] = [...cajas.map((c) => c.unidad), ...envios.map((e) => e.unidad)];
  await tx.unidadTrazable.createMany({
    data: unidades.map((u) => ({ tipo: u.tipo, codigo: u.codigo, fechaRegistro: u.fechaRegistro })),
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

  const instancias: InstanciaPlan[] = [...cajas.map((c) => c.instancia), ...envios.map((e) => e.instancia)];
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
      ...cajas.map((c) => ({ idInstancia: c.instancia.id!, idUnidad: c.unidad.id!, rol: RolUnidadFlujo.PRINCIPAL })),
      ...envios.map((e) => ({ idInstancia: e.instancia.id!, idUnidad: e.unidad.id!, rol: RolUnidadFlujo.PRINCIPAL })),
    ],
  });

  const ejecuciones: EjecucionPlan[] = [
    ...cajas.flatMap((c) => c.ejecuciones),
    ...envios.flatMap((e) => e.ejecuciones),
    ...fase4Nuevas.flatMap((f) => (f.ejecucionPlan ? [f.ejecucionPlan] : [])),
  ];
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
  const idsInstancia = [...new Set([...instancias.map((i) => i.id!), ...fase4Nuevas.map((f) => f.idInstancia)])];
  const ejecucionesBD = await tx.faseEjecucion.findMany({
    where: { idInstancia: { in: idsInstancia } },
    select: { idEjecucion: true, idInstancia: true, idFase: true, numeroIntento: true },
  });
  const ejecucionPorClave = new Map(
    ejecucionesBD.map((e) => [`${e.idInstancia.toString()}|${e.idFase}|${e.numeroIntento}`, e.idEjecucion]),
  );
  ejecucionesUnicas.forEach((e) => {
    e.id = ejecucionPorClave.get(`${e.instancia.id!.toString()}|${e.idFase}|${e.numeroIntento}`);
  });

  const transiciones: TransicionPlan[] = [
    ...cajas.flatMap((c) => c.transiciones),
    ...envios.flatMap((e) => e.transiciones),
    ...fase4Nuevas.flatMap((f) => f.transiciones),
  ];
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
  const idsEjecucion = ejecucionesUnicas.map((e) => e.id!);
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

  const bloques = buildBloques([...cajas.flatMap((c) => c.transiciones), ...envios.flatMap((e) => e.transiciones)]);
  const bloquesFase4: Prisma.RegistroBlockchainCreateManyInput[] = [];
  const fase4Transiciones = fase4Nuevas.flatMap((f) => f.transiciones);
  if (fase4Transiciones.length > 0) {
    const idInstanciasF4 = [...new Set(fase4Nuevas.map((f) => f.idInstancia))];
    const registros = await tx.registroBlockchain.findMany({
      where: { idInstancia: { in: idInstanciasF4 } },
      select: { idInstancia: true, indice: true, hashDatos: true },
    });
    const tips = new Map<bigint, { indice: number; hash: string | null }>();
    for (const r of registros) {
      const previo = tips.get(r.idInstancia);
      if (!previo || r.indice > previo.indice) tips.set(r.idInstancia, { indice: r.indice, hash: r.hashDatos });
    }
    const cadenasF4 = new Map<bigint, { indice: number; hash: string | null }>();
    for (const t of fase4Transiciones) {
      const clave = t.instancia.id!;
      const previo = cadenasF4.get(clave) ?? tips.get(clave) ?? { indice: -1, hash: null };
      const indice = previo.indice + 1;
      const hashAnterior = previo.hash;
      const payload = buildBlockPayload(
        indice,
        clave,
        {
          idTransicion: t.id!,
          fechaTransicion: t.fechaTransicion,
          datosAdicionales: t.datosAdicionales as Prisma.JsonValue,
        },
        hashAnterior,
      );
      const hashDatos = hashPayload(payload);
      cadenasF4.set(clave, { indice, hash: hashDatos });
      bloquesFase4.push({
        idInstancia: clave,
        idTransicion: t.id!,
        indice,
        hashDatos,
        hashAnterior,
        payloadCanonico: payload,
        fechaRegistro: t.fechaTransicion,
      });
    }
  }
  await tx.registroBlockchain.createMany({ data: [...bloques, ...bloquesFase4] });

  await tx.empaque.createMany({
    data: cajas.map((c) => ({
      idUnidad: c.unidad.id!,
      idEjecucion: c.idEjecucionEmpaque,
      idLote: c.idLote,
      idCategoriaCalidad: c.empaqueDatos.idCategoriaCalidad,
      codigoCaja: c.empaqueDatos.codigoCaja,
      fechaEmpaque: c.empaqueDatos.fechaEmpaque,
      pesoNetoKg: c.empaqueDatos.pesoNetoKg,
      codigoQr: null,
      estado: c.empaqueDatos.estado,
    })),
  });
  const codigosCaja = cajas.map((c) => c.empaqueDatos.codigoCaja);
  const empaquesBD = await tx.empaque.findMany({
    where: { codigoCaja: { in: codigosCaja } },
    select: { idEmpaque: true, codigoCaja: true },
  });
  const empaquePorCodigo = new Map(empaquesBD.map((e) => [e.codigoCaja, e.idEmpaque]));
  cajas.forEach((c) => {
    c.idEmpaque = empaquePorCodigo.get(c.empaqueDatos.codigoCaja);
  });

  await tx.envio.createMany({
    data: envios.map((en) => ({
      idUnidad: en.unidad.id!,
      idEjecucion: en.fase4.idEjecucion ?? en.fase4.ejecucionPlan!.id!,
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
    data: envios.map((en) => ({ idEnvio: en.idEnvio!, idEmpaque: en.caja.idEmpaque! })),
  });

  const eventosBulk: EventoPlan[] = [...cajas.flatMap((c) => c.eventos), ...envios.flatMap((e) => e.eventos)];
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

  const documentosPorEnvio = envios.filter((en) => en.documentos.length > 0);
  if (documentosPorEnvio.length > 0) {
    const idEventosBD = await tx.eventoTrazabilidad.findMany({
      where: { idUnidad: { in: documentosPorEnvio.map((en) => en.unidad.id!) } },
      orderBy: { idEvento: 'asc' },
      select: { idEvento: true, idUnidad: true },
    });
    const eventosPorUnidad = new Map<bigint, bigint[]>();
    for (const e of idEventosBD) {
      const lista = eventosPorUnidad.get(e.idUnidad) ?? [];
      lista.push(e.idEvento);
      eventosPorUnidad.set(e.idUnidad, lista);
    }
    const documentos: Prisma.DocumentoReferenciaCreateManyInput[] = [];
    for (const en of documentosPorEnvio) {
      const idsEvento = eventosPorUnidad.get(en.unidad.id!) ?? [];
      if (idsEvento.length === 0) continue;
      for (let i = 0; i < en.documentos.length; i++) {
        const d = en.documentos[i];
        documentos.push({
          idEvento: idsEvento[Math.min(i, idsEvento.length - 1)],
          idTipoDocumento: d.idTipoDocumento,
          nombre: d.nombre,
          url: d.url,
          fechaCarga: d.fechaCarga,
        });
      }
    }
    if (documentos.length > 0) {
      await createManyChunked(
        (data) => tx.documentoReferencia.createMany({ data }),
        documentos,
        CHUNK_INSERT,
      );
    }
  }
}

async function sembrarUsuarios(
  prisma: PrismaClient,
  productores: Array<{ idProductor: bigint }>,
): Promise<number> {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const claveHash = await bcrypt.hash('demo12345', saltRounds);

  const totalSlots = Math.min(OBJETIVO_USUARIOS, productores.length);
  const slots: number[] = [];
  let grupo = 0;
  while (slots.length < totalSlots) {
    const { idRol, cantidad } = DISTRIBUCION_ROLES[grupo % DISTRIBUCION_ROLES.length];
    const fin = Math.min(slots.length + cantidad, totalSlots);
    for (let k = slots.length; k < fin; k++) slots.push(idRol);
    grupo += 1;
  }
  const rngShuffle = crearPRNG(4_000_000);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rngShuffle() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  const usuarios: Prisma.UsuarioCreateManyInput[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const rng = crearPRNG(4_050_000 + i * 977);
    // Constraint usuarios_productor_role_check: solo roles supervisor (2) y gerente (6)
    // pueden tener id_productor; calidad (3) y logística (4) van con NULL (personal central).
    const rolConProductor =
      slots[i] === ROLE_IDS.SUPERVISOR_AGRICOLA || slots[i] === ROLE_IDS.GERENTE_PRODUCTOR;
    usuarios.push({
      idRol: slots[i],
      idProductor: rolConProductor ? productores[i].idProductor : null,
      nombres: `${elegir(rng, NOMBRES)} ${elegir(rng, NOMBRES)}`,
      apellidos: `${elegir(rng, APELLIDOS)} ${elegir(rng, APELLIDOS)}`,
      correo: `usr09fin${String(i + 1).padStart(5, '0')}@example.com`,
      claveHash,
      estado: true,
      fechaCreacion: fechaCreacionUsuario(rng),
    });
  }

  if (usuarios.length > 0) {
    await createManyChunked((data) => prisma.usuario.createMany({ data }), usuarios, CHUNK_USUARIOS);
  }
  console.log(`Usuarios BI2 sembrados: ${usuarios.length}.`);
  return usuarios.length;
}

const DIAS_VIGENCIA_CERTIFICACION: Record<string, number> = {
  FITOSANITARIA: 365,
  GLOBALGAP: 1_095,
  ORGANICA: 1_095,
  GRASP: 730,
  COMERCIO_JUSTO: 730,
  RAINFOREST_ALLIANCE: 1_095,
};

const ENTIDAD_COHERENTE: Record<string, string> = {
  FITOSANITARIA: 'AGROCALIDAD_EC',
  GLOBALGAP: 'GLOBALGAP',
  ORGANICA: 'USDA',
  GRASP: 'GLOBALGAP',
  COMERCIO_JUSTO: 'FAIRTRADE',
  RAINFOREST_ALLIANCE: 'RAINFOREST_ALLIANCE',
};

async function sembrarCertificaciones(
  prisma: PrismaClient,
  fincas: Array<{ idFinca: bigint }>,
): Promise<number> {
  const [tipos, entidades] = await Promise.all([
    prisma.tipoCertificacion.findMany({ select: { idTipoCertificacion: true, codigo: true } }),
    prisma.entidadCertificadora.findMany({ select: { idEntidadCertificadora: true, codigo: true } }),
  ]);
  if (tipos.length === 0 || entidades.length === 0) {
    console.log('Sin catálogos de certificación; se omite certificaciones BI2.');
    return 0;
  }
  const entidadPorCodigo = new Map(entidades.map((e) => [e.codigo, e.idEntidadCertificadora]));

  const certificaciones: Prisma.CertificacionCreateManyInput[] = [];
  const contador = new Map<string, number>();
  let fincasSeleccionadas = 0;
  for (const finca of fincas) {
    const rng = crearPRNG(4_100_000 + Number(finca.idFinca) * 17);
    if (rng() >= PROPORCION_FINCAS_CERTIFICADAS) continue;
    fincasSeleccionadas += 1;
    const cantidad = rng() < 0.15 ? 2 : 1;
    for (let i = 0; i < cantidad; i++) {
      const tipo = elegirPonderado(rng, tipos, (t) => (t.codigo === 'FITOSANITARIA' ? 0.4 : 0.12));
      const entidad =
        entidadPorCodigo.get(ENTIDAD_COHERENTE[tipo.codigo] ?? '') ??
        entidades[Math.floor(rng() * entidades.length)].idEntidadCertificadora;
      const periodoDias = DIAS_VIGENCIA_CERTIFICACION[tipo.codigo] ?? 730;
      const vigente = rng() < 0.6;
      const fechaEmision = vigente
        ? fechaEnVentana(rng, sumarDias(FECHA_HOY, -periodoDias), sumarDias(FECHA_HOY, -1), { conHora: false })
        : fechaEnVentana(
            rng,
            sumarDias(FECHA_HOY, -(periodoDias + 365)),
            sumarDias(FECHA_HOY, -(periodoDias + 1)),
            { conHora: false },
          );
      const fechaVencimiento = sumarDias(fechaEmision, periodoDias);
      const anio = fechaEmision.getUTCFullYear();
      const clave = `${tipo.codigo}-${anio}`;
      const secuencia = (contador.get(clave) ?? 0) + 1;
      contador.set(clave, secuencia);
      const numeroCertificado = `FIN-${tipo.codigo}-${anio}-${String(secuencia).padStart(6, '0')}`;
      certificaciones.push({
        idFinca: finca.idFinca,
        idTipoCertificacion: tipo.idTipoCertificacion,
        idEntidadCertificadora: entidad,
        numeroCertificado,
        fechaEmision,
        fechaVencimiento,
        documentoUrl: `https://docs.bananotrace.test/certificados/${tipo.codigo}/${numeroCertificado}.pdf`,
      });
    }
  }

  if (certificaciones.length > 0) {
    await createManyChunked(
      (data) => prisma.certificacion.createMany({ data }),
      certificaciones,
      CHUNK_CERTIFICACIONES,
    );
  }
  console.log(
    `Certificaciones BI2 sembradas: ${certificaciones.length} (${fincasSeleccionadas} fincas certificadas).`,
  );
  return certificaciones.length;
}

async function flushControles(tx: Tx, planes: ControlPlan[]): Promise<void> {
  await createManyChunked(
    (data) =>
      tx.controlCalidad.createMany({
        data: data.map((c: ControlPlan) => ({
          idEjecucion: c.idEjecucion,
          idLote: c.idLote,
          idUsuario: c.idUsuario,
          idCategoriaCalidad: c.idCategoriaCalidad,
          fechaControl: c.fechaControl,
          calibreMm: c.calibreMm,
          pesoMuestraKg: c.pesoMuestraKg,
          porcentajeRechazo: c.porcentajeRechazo,
          resultado: c.resultado,
          observaciones: c.observaciones,
        })),
      }),
    planes,
    CHUNK_INSERT,
  );
}

async function sincronizarCorrelativos(prisma: PrismaClient): Promise<void> {
  const prefijos: Record<string, string> = { FINCA: 'FIN', EMPAQUE: 'CAJ', ENVIO: 'ENV' };
  const pares: Array<{ entidad: string; anio: number; ultimo: number }> = [];
  for (const [entidad, contador] of Object.entries(correlativos)) {
    for (const anio of contador.anios(prefijos[entidad])) {
      const maximo = contador.maximo(prefijos[entidad], anio);
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

    console.log(`Sembrando BI de volumen 2 (existen ${existentes} productores ${PREFIJO_PRODUCTOR}).`);

    const t0 = Date.now();
    const sembrados = await sembrarProductoresFincas(prisma, existentes);
    console.log(`Fase productores/fincas en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const t0b = Date.now();
    const totalUsuarios = await sembrarUsuarios(prisma, sembrados.productoresCreados);
    console.log(`Fase usuarios en ${((Date.now() - t0b) / 1000).toFixed(1)}s`);

    const t0c = Date.now();
    const totalCertificaciones = await sembrarCertificaciones(prisma, sembrados.fincasCreadas);
    console.log(`Fase certificaciones en ${((Date.now() - t0c) / 1000).toFixed(1)}s`);

    const t1 = Date.now();
    const ctx = await cargarContexto(prisma);
    console.log(`Fase contexto en ${((Date.now() - t1) / 1000).toFixed(1)}s`);

    const t2 = Date.now();
    const { lotesFase3, lotesFase2, lotePorInstancia } = await cargarLotesBase(prisma, ctx);
    console.log(`Lotes base: ${lotesFase3.length} con fase EMPAQUE, ${lotesFase2.length} con fase CALIDAD.`);
    if (lotesFase3.length === 0 || lotesFase2.length === 0) {
      throw new Error('No hay lotes base suficientes para sembrar cajas/envíos o controles.');
    }

    let totalCajas = 0;
    let totalEjecuciones = 0;
    let totalTransiciones = 0;
    let totalEventos = 0;
    let totalDocumentos = 0;
    let totalFase4Creadas = 0;
    const usadosContenedores = new Set<string>();

    const t3 = Date.now();
    for (let ini = 0; ini < OBJETIVO_CAJAS; ini += CHUNK_CAJAS) {
      const fin = Math.min(ini + CHUNK_CAJAS, OBJETIVO_CAJAS);
      const idLotesChunk = new Set<bigint>();
      for (let k = ini; k < fin; k++) idLotesChunk.add(lotesFase3[k % lotesFase3.length].idLote);
      const fase4DB = await consultarFase4PorLotes(prisma, ctx, idLotesChunk, lotePorInstancia);
      const fase4Chunk = new Map<bigint, Fase4Lote>();
      const planes: Array<{ caja: CajaPlan; envio: EnvioPlan }> = [];
      for (let k = ini; k < fin; k++) {
        const rng = crearPRNG(2_000_000 + k * 7919);
        const lote = lotesFase3[k % lotesFase3.length];
        planes.push(planearCajaEnvio(rng, ctx, lote, fase4DB.get(lote.idLote), fase4Chunk, usadosContenedores));
      }
      const fase4Nuevas = [...fase4Chunk.values()].filter((f) => f.ejecucionPlan !== null);
      await prisma.$transaction(
        async (tx) => {
          await flushCajasEnvios(tx, planes, fase4Nuevas);
        },
        { timeout: 600_000 },
      );
      totalCajas += planes.length;
      totalFase4Creadas += fase4Nuevas.length;
      for (const p of planes) {
        totalEjecuciones += p.caja.ejecuciones.length + p.envio.ejecuciones.length;
        totalTransiciones += p.caja.transiciones.length + p.envio.transiciones.length;
        totalEventos += p.caja.eventos.length + p.envio.eventos.length;
        totalDocumentos += p.envio.documentos.length;
      }
      totalEjecuciones += fase4Nuevas.length;
      totalTransiciones += fase4Nuevas.reduce((s, f) => s + f.transiciones.length, 0);
      if (totalCajas % 5_000 === 0) {
        console.log(`Cajas+envíos planificados: ${totalCajas}/${OBJETIVO_CAJAS} (${((Date.now() - t3) / 1000).toFixed(1)}s)`);
      }
    }
    console.log(`Fase cajas/envíos en ${((Date.now() - t3) / 1000).toFixed(1)}s`);
    console.log(
      `Totales amplificados: ${totalCajas} cajas, ${totalCajas} envíos, ${totalCajas * 2} unidades, ${totalCajas * 2} instancias, ${totalEjecuciones} ejecuciones, ${totalTransiciones} transiciones, ${totalTransiciones} bloques, ${totalEventos} eventos, ${totalDocumentos} documentos, ${totalFase4Creadas} ejecuciones LOGISTICA creadas.`,
    );

    let totalControles = 0;
    const t4 = Date.now();
    for (let ini = 0; ini < OBJETIVO_CONTROLES; ini += CHUNK_CONTROLES) {
      const fin = Math.min(ini + CHUNK_CONTROLES, OBJETIVO_CONTROLES);
      const planes: ControlPlan[] = [];
      for (let k = ini; k < fin; k++) {
        const rng = crearPRNG(3_000_000 + k * 7919);
        planes.push(planearControl(rng, ctx, k, lotesFase2));
      }
      await prisma.$transaction(
        async (tx) => {
          await flushControles(tx, planes);
        },
        { timeout: 600_000 },
      );
      totalControles += planes.length;
    }
    console.log(`Fase controles en ${((Date.now() - t4) / 1000).toFixed(1)}s`);

    const t5 = Date.now();
    await sincronizarCorrelativos(prisma);
    console.log(`Fase correlativos en ${((Date.now() - t5) / 1000).toFixed(1)}s`);

    console.log(
      `Resumen BI volumen 2: ${sembrados.productores} productores, ${sembrados.fincas} fincas, ${totalUsuarios} usuarios, ${totalCertificaciones} certificaciones, ${totalCajas} empaques, ${totalCajas} envíos, ${totalCajas} envio_empaque, ${totalControles} controles, ${totalDocumentos} documentos, ${totalCajas * 2} unidades, ${totalCajas * 2} instancias, ${totalEjecuciones} ejecuciones, ${totalTransiciones} transiciones, ${totalTransiciones} bloques, ${totalEventos} eventos.`,
    );
    console.log(`Total BI volumen 2 sembrado en ${((Date.now() - inicio) / 1000).toFixed(1)}s.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
