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
import { registrarBloque } from '../../src/blockchain/blockchain-chain';
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
} from './helpers/bi-data';
import type { FincaVolumen, ProductorVolumen } from './productores-fincas-volumen.seeder';
import type { UsuariosVolumen } from './usuarios-volumen.seeder';

type Tx = Prisma.TransactionClient;

const OBJETIVO_LOTES = 240;

/**
 * Distribución de estados finales que alcanza cada lote sembrado.
 * Incluye PLANIFICADO y COSECHADO para que el BI vea todo el ciclo de vida.
 */
const DISTRIBUCION: Array<{ etapa: Etapa; cantidad: number }> = [
  { etapa: 'PLANIFICADO', cantidad: 16 },
  { etapa: 'EN_PRODUCCION', cantidad: 40 },
  { etapa: 'COSECHADO', cantidad: 20 },
  { etapa: 'CALIDAD', cantidad: 24 },
  { etapa: 'CALIDAD_RECHAZADO', cantidad: 24 },
  { etapa: 'EMPACADO', cantidad: 48 },
  { etapa: 'EXPORTADO', cantidad: 48 },
  { etapa: 'CERRADO', cantidad: 20 },
];

type Etapa =
  | 'PLANIFICADO'
  | 'EN_PRODUCCION'
  | 'COSECHADO'
  | 'CALIDAD'
  | 'CALIDAD_RECHAZADO'
  | 'EMPACADO'
  | 'EXPORTADO'
  | 'CERRADO';

interface FaseLote {
  idFase: number;
  estadoLoteInicio: EstadoLote | null;
  estadoLoteFin: EstadoLote | null;
}

interface FaseSimple {
  idFase: number;
  codigo: string;
}

interface TipoDocContext {
  idTipoDocumento: number;
  codigo: string;
  nombre: string;
}

interface FlujoContext {
  idFlujoPrincipal: number;
  fasesPrincipales: Record<'PRODUCCION' | 'CALIDAD' | 'EMPAQUE' | 'LOGISTICA', FaseLote>;
  idFlujoEmpaque: number;
  fasesEmpaque: FaseSimple[];
  idFlujoEnvio: number;
  fasesEnvio: FaseSimple[];
  variedades: Array<{ idVariedad: number }>;
  categorias: Array<{ idCategoriaCalidad: number }>;
  navieras: Array<{ idNaviera: number; codigo: string | null }>;
  puertosOrigen: Array<{ idPuerto: number }>;
  puertosDestino: Array<{ idPuerto: number }>;
  tiposEvento: Map<string, number>;
  tiposDocumento: TipoDocContext[];
  fincas: FincaVolumen[];
  usuarios: UsuariosVolumen;
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

interface FaseEjecucionRow {
  idFase: number;
  idEjecucion: bigint;
}

interface FlujoUnidadResult {
  idInstancia: bigint;
  idEjecucion: bigint;
}

/** Contador de códigos explícitos por año (2024/2025). 2026 lo asigna el trigger. */
class ContadorCodigo {
  private ultimoPorAnio = new Map<number, number>();

  siguiente(anio: number, prefijo: string): string {
    const ultimo = (this.ultimoPorAnio.get(anio) ?? 0) + 1;
    this.ultimoPorAnio.set(anio, ultimo);
    return `${prefijo}-${anio}-${String(ultimo).padStart(3, '0')}`;
  }
}

const contadorLote = new ContadorCodigo();
const contadorEmpaque = new ContadorCodigo();
const contadorEnvio = new ContadorCodigo();

/** Aplica una hora laboral aleatoria (6:00-20:59) a una fecha base. */
function conHoraLaboral(rng: () => number, fecha: Date): Date {
  const copia = new Date(fecha.getTime());
  copia.setUTCHours(enteroEntre(rng, 6, 20), enteroEntre(rng, 0, 59), 0, 0);
  return copia;
}

function cronogramaDesdeCosecha(
  rng: () => number,
  fechaCosecha: Date,
): { fechaSiembra: Date; fechaEstimadaCosecha: Date; fechaCosecha: Date } {
  const mesSiembraAprox = (fechaCosecha.getUTCMonth() + 12 - 10) % 12;
  const ciclo = cicloBanano(rng, mesSiembraAprox);
  const fechaSiembra = restarDias(fechaCosecha, ciclo);
  const fechaEstimadaCosecha = restarDias(fechaCosecha, enteroEntre(rng, 20, 40));
  return { fechaSiembra, fechaEstimadaCosecha, fechaCosecha };
}

function cronogramaPorEtapa(rng: () => number, etapa: Etapa): Cronograma {
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

  switch (etapa) {
    case 'PLANIFICADO': {
      const fechaSiembra = sumarDias(ahora, enteroEntre(rng, 0, 90));
      const ciclo = cicloBanano(rng, fechaSiembra.getUTCMonth());
      base.fechaSiembra = fechaSiembra;
      base.fechaEstimadaCosecha = restarDias(
        sumarDias(fechaSiembra, ciclo),
        enteroEntre(rng, 20, 40),
      );
      return base;
    }
    case 'EN_PRODUCCION': {
      const fechaSiembra = restarDias(ahora, enteroEntre(rng, 30, 250));
      const ciclo = cicloBanano(rng, fechaSiembra.getUTCMonth());
      base.fechaSiembra = fechaSiembra;
      base.fechaEstimadaCosecha = restarDias(
        sumarDias(fechaSiembra, ciclo),
        enteroEntre(rng, 20, 40),
      );
      return base;
    }
    case 'COSECHADO': {
      const fechaCosecha = restarDias(ahora, enteroEntre(rng, 0, 7));
      Object.assign(base, cronogramaDesdeCosecha(rng, fechaCosecha));
      return base;
    }
    case 'CALIDAD': {
      const fechaCosecha = restarDias(ahora, enteroEntre(rng, 5, 12));
      Object.assign(base, cronogramaDesdeCosecha(rng, fechaCosecha));
      base.fechaControl = sumarDias(fechaCosecha, enteroEntre(rng, 1, 4));
      return base;
    }
    case 'CALIDAD_RECHAZADO': {
      const anio = elegirAnio(rng, { 2024: 0.3, 2025: 0.35, 2026: 0.35 });
      const inicio = new Date(Date.UTC(anio, 0, 1));
      const fin =
        anio >= 2026 ? restarDias(ahora, 10) : new Date(Date.UTC(anio, 11, 31));
      const fechaCosecha = fechaEnVentana(rng, inicio, fin, { conHora: false });
      Object.assign(base, cronogramaDesdeCosecha(rng, fechaCosecha));
      base.fechaControl = sumarDias(fechaCosecha, enteroEntre(rng, 1, 4));
      return base;
    }
    case 'EMPACADO': {
      const fechaCosecha = restarDias(ahora, enteroEntre(rng, 1, 90));
      Object.assign(base, cronogramaDesdeCosecha(rng, fechaCosecha));
      base.fechaControl = sumarDias(fechaCosecha, enteroEntre(rng, 1, 4));
      base.fechaEmpaque = sumarDias(base.fechaControl!, enteroEntre(rng, 1, 3));
      base.fechaSalida = sumarDias(base.fechaEmpaque!, enteroEntre(rng, 1, 5));
      return base;
    }
    case 'EXPORTADO': {
      const anio = elegirAnio(rng, { 2024: 0.35, 2025: 0.35, 2026: 0.3 });
      const inicio = new Date(Date.UTC(anio, 0, 1));
      const fin =
        anio >= 2026 ? restarDias(ahora, 25) : new Date(Date.UTC(anio, 11, 31));
      const fechaCosecha = fechaEnVentana(rng, inicio, fin, { conHora: false });
      Object.assign(base, cronogramaDesdeCosecha(rng, fechaCosecha));
      base.fechaControl = sumarDias(fechaCosecha, enteroEntre(rng, 1, 4));
      base.fechaEmpaque = sumarDias(base.fechaControl!, enteroEntre(rng, 1, 3));
      base.fechaSalida = sumarDias(base.fechaEmpaque!, enteroEntre(rng, 1, 5));
      base.fechaCargado = sumarDias(base.fechaSalida!, enteroEntre(rng, 0, 2));
      base.fechaTransito = sumarDias(base.fechaCargado!, enteroEntre(rng, 1, 3));
      return base;
    }
    case 'CERRADO': {
      const anio = elegirAnio(rng, { 2024: 0.35, 2025: 0.35, 2026: 0.3 });
      const inicio = new Date(Date.UTC(anio, 0, 1));
      const fin =
        anio >= 2026 ? restarDias(ahora, 60) : new Date(Date.UTC(anio, 11, 31));
      const fechaCosecha = fechaEnVentana(rng, inicio, fin, { conHora: false });
      Object.assign(base, cronogramaDesdeCosecha(rng, fechaCosecha));
      base.fechaControl = sumarDias(fechaCosecha, enteroEntre(rng, 1, 4));
      base.fechaEmpaque = sumarDias(base.fechaControl!, enteroEntre(rng, 1, 3));
      base.fechaSalida = sumarDias(base.fechaEmpaque!, enteroEntre(rng, 1, 5));
      base.fechaCargado = sumarDias(base.fechaSalida!, enteroEntre(rng, 0, 2));
      base.fechaTransito = sumarDias(base.fechaCargado!, enteroEntre(rng, 1, 3));
      base.fechaEntrega = sumarDias(base.fechaTransito!, enteroEntre(rng, 8, 22));
      return base;
    }
  }
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

function observar(rng: () => number, resultado: ResultadoControl): string | null {
  if (resultado === ResultadoControl.APROBADO && rng() < 0.6) return null;
  return elegir(rng, OBSERVACIONES[resultado]);
}

async function abrirFlujoUnidad(
  tx: Tx,
  params: {
    idUnidad: bigint;
    idFlujo: number;
    codigoInstancia: string;
    primeraFase: FaseSimple | FaseLote;
    fecha: Date;
    datosAdicionales?: Prisma.InputJsonValue;
    idResponsable?: bigint;
    estadoInstancia?: EstadoFlujo;
  },
): Promise<FlujoUnidadResult> {
  const instancia = await tx.flujoInstancia.create({
    data: {
      idFlujo: params.idFlujo,
      codigo: params.codigoInstancia,
      estado: params.estadoInstancia ?? EstadoFlujo.PENDIENTE,
      fechaInicio: params.fecha,
      fechaRegistro: params.fecha,
      unidades: {
        create: { idUnidad: params.idUnidad, rol: RolUnidadFlujo.PRINCIPAL },
      },
    },
    select: { idInstancia: true },
  });
  const ejecucion = await tx.faseEjecucion.create({
    data: {
      idInstancia: instancia.idInstancia,
      idFlujo: params.idFlujo,
      idFase: params.primeraFase.idFase,
      estado: EstadoFlujo.EN_PROCESO,
      idResponsable: params.idResponsable,
      fechaInicio: params.fecha,
      fechaRegistro: params.fecha,
      datosAdicionales: params.datosAdicionales ?? {},
    },
    select: { idEjecucion: true },
  });

  return {
    idInstancia: instancia.idInstancia,
    idEjecucion: ejecucion.idEjecucion,
  };
}

async function avanzarLote(
  tx: Tx,
  params: {
    idLote: bigint;
    idInstancia: bigint;
    idFlujo: number;
    faseActual: {
      execId: bigint;
      info: FaseLote;
    };
    siguienteFase: FaseLote | null;
    idUsuario: bigint;
    fecha: Date;
    comentario: string;
    datosAdicionales?: Prisma.InputJsonValue;
    fechaSiguienteFase?: Date;
  },
): Promise<bigint | null> {
  const { idLote, idInstancia, faseActual, siguienteFase } = params;

  if (siguienteFase) {
    const transicion = await tx.transicionEjecucion.create({
      data: {
        idEjecucion: faseActual.execId,
        idUsuario: params.idUsuario,
        estadoAnterior: EstadoFlujo.EN_PROCESO,
        estadoNuevo: EstadoFlujo.COMPLETADO,
        comentario: params.comentario,
        fechaTransicion: params.fecha,
        datosAdicionales: params.datosAdicionales ?? {},
      },
    });
    await registrarBloque(tx, { idInstancia, transicion });
    await tx.faseEjecucion.update({
      where: { idEjecucion: faseActual.execId },
      data: {
        estado: EstadoFlujo.COMPLETADO,
        fechaFin: params.fecha,
      },
    });
    const faseNueva = await tx.faseEjecucion.create({
      data: {
        idInstancia,
        idFlujo: params.idFlujo,
        idFase: siguienteFase.idFase,
        estado: EstadoFlujo.EN_PROCESO,
        fechaInicio: params.fechaSiguienteFase ?? params.fecha,
        fechaRegistro: params.fechaSiguienteFase ?? params.fecha,
        datosAdicionales: params.datosAdicionales ?? {},
      },
    });
    const transInicio = await tx.transicionEjecucion.create({
      data: {
        idEjecucion: faseNueva.idEjecucion,
        idUsuario: params.idUsuario,
        estadoAnterior: EstadoFlujo.PENDIENTE,
        estadoNuevo: EstadoFlujo.EN_PROCESO,
        comentario: 'Inicio de fase (seed)',
        fechaTransicion: params.fechaSiguienteFase ?? params.fecha,
        datosAdicionales: params.datosAdicionales ?? {},
      },
    });
    await registrarBloque(tx, { idInstancia, transicion: transInicio });

    await tx.loteProduccion.update({
      where: { idLote },
      data: {
        estado: siguienteFase.estadoLoteInicio ?? undefined,
        fechaActualizacion: params.fecha,
      },
    });

    return faseNueva.idEjecucion;
  }

  const transicion = await tx.transicionEjecucion.create({
    data: {
      idEjecucion: faseActual.execId,
      idUsuario: params.idUsuario,
      estadoAnterior: EstadoFlujo.EN_PROCESO,
      estadoNuevo: EstadoFlujo.COMPLETADO,
      comentario: params.comentario,
      fechaTransicion: params.fecha,
      datosAdicionales: params.datosAdicionales ?? {},
    },
  });
  await registrarBloque(tx, { idInstancia, transicion });
  await tx.faseEjecucion.update({
    where: { idEjecucion: faseActual.execId },
    data: {
      estado: EstadoFlujo.COMPLETADO,
      fechaFin: params.fecha,
    },
  });

  await tx.loteProduccion.update({
    where: { idLote },
    data: {
      estado: faseActual.info.estadoLoteFin ?? undefined,
      fechaActualizacion: params.fecha,
    },
  });

  return null;
}

async function avanzarUnidadFlujo(
  tx: Tx,
  params: {
    idInstancia: bigint;
    idFlujo: number;
    faseActualExecId: bigint;
    siguienteFase: FaseSimple | null;
    esTerminal: boolean;
    idUsuario: bigint;
    fecha: Date;
    datosAdicionales?: Prisma.InputJsonValue;
    fechaInicio?: Date;
  },
): Promise<{ nuevaEjecucionId: bigint; codigo: string }> {
  const { idInstancia, faseActualExecId, siguienteFase } = params;

  // Cierre de la fase actual: única historia que deja este avance.
  const transicion = await tx.transicionEjecucion.create({
    data: {
      idEjecucion: faseActualExecId,
      idUsuario: params.idUsuario,
      estadoAnterior: EstadoFlujo.EN_PROCESO,
      estadoNuevo: EstadoFlujo.COMPLETADO,
      comentario: siguienteFase
        ? 'Avance de flujo (seed)'
        : 'Finalización de flujo (seed)',
      fechaTransicion: params.fecha,
      datosAdicionales: params.datosAdicionales ?? {},
    },
  });
  await registrarBloque(tx, { idInstancia, transicion });
  await tx.faseEjecucion.update({
    where: { idEjecucion: faseActualExecId },
    data: {
      estado: EstadoFlujo.COMPLETADO,
      fechaFin: params.fecha,
    },
  });

  if (!siguienteFase) {
    return { nuevaEjecucionId: faseActualExecId, codigo: '' };
  }

  if (params.esTerminal) {
    // Fase terminal: la ejecución queda COMPLETADO con su transición y bloque,
    // y la instancia pasa a COMPLETADO (igual que la app al llegar al estado final).
    const faseTerminal = await tx.faseEjecucion.create({
      data: {
        idInstancia,
        idFlujo: params.idFlujo,
        idFase: siguienteFase.idFase,
        estado: EstadoFlujo.COMPLETADO,
        idResponsable: params.idUsuario,
        fechaInicio: params.fechaInicio ?? params.fecha,
        fechaRegistro: params.fechaInicio ?? params.fecha,
        fechaFin: params.fecha,
        datosAdicionales: params.datosAdicionales ?? {},
      },
    });
    const transTerminal = await tx.transicionEjecucion.create({
      data: {
        idEjecucion: faseTerminal.idEjecucion,
        idUsuario: params.idUsuario,
        estadoAnterior: null,
        estadoNuevo: EstadoFlujo.COMPLETADO,
        comentario: 'Finalización de flujo (seed)',
        fechaTransicion: params.fecha,
        datosAdicionales: params.datosAdicionales ?? {},
      },
    });
    await registrarBloque(tx, { idInstancia, transicion: transTerminal });
    await tx.flujoInstancia.update({
      where: { idInstancia },
      data: { estado: EstadoFlujo.COMPLETADO, fechaFin: params.fecha },
    });
    return {
      nuevaEjecucionId: faseTerminal.idEjecucion,
      codigo: siguienteFase.codigo,
    };
  }

  // Fase siguiente activa: NO lleva transición ni bloque propios; los genera la
  // app cuando la fase se avanza de verdad.
  const faseNueva = await tx.faseEjecucion.create({
    data: {
      idInstancia,
      idFlujo: params.idFlujo,
      idFase: siguienteFase.idFase,
      estado: EstadoFlujo.EN_PROCESO,
      idResponsable: params.idUsuario,
      fechaInicio: params.fechaInicio ?? params.fecha,
      fechaRegistro: params.fechaInicio ?? params.fecha,
      datosAdicionales: params.datosAdicionales ?? {},
    },
  });

  return {
    nuevaEjecucionId: faseNueva.idEjecucion,
    codigo: siguienteFase.codigo,
  };
}

async function crearDocumentos(
  tx: Tx,
  ctx: FlujoContext,
  params: {
    lote: string;
    envio: string;
    contenedor: string;
    eventoId: bigint;
    anio: number;
    fecha: Date;
    rng: () => number;
  },
): Promise<void> {
  const certificado = ctx.tiposDocumento.find((t) => t.codigo === 'CERTIFICADO');
  const conocimiento = ctx.tiposDocumento.find(
    (t) => t.codigo === 'CONOCIMIENTO_EMBARQUE',
  );
  const guia = ctx.tiposDocumento.find((t) => t.codigo === 'GUIA_REMISION');

  const documentos: Array<{
    tipo: TipoDocContext | undefined;
    nombre: string;
    slug: string;
    codigo: string;
  }> = [
    {
      tipo: certificado,
      nombre: `Certificado fitosanitario ${params.lote}`,
      slug: 'fitosanitario',
      codigo: params.lote,
    },
    {
      tipo: certificado,
      nombre: `Certificado de origen ${params.lote}`,
      slug: 'origen',
      codigo: params.lote,
    },
    {
      tipo: conocimiento,
      nombre: `Bill of lading ${params.contenedor}`,
      slug: 'embarque',
      codigo: params.contenedor,
    },
    {
      tipo: guia,
      nombre: `Guía de remisión ${params.envio}`,
      slug: 'guia',
      codigo: params.envio,
    },
  ];

  for (const documento of documentos) {
    if (!documento.tipo) continue;
    await tx.documentoReferencia.create({
      data: {
        idEvento: params.eventoId,
        idTipoDocumento: documento.tipo.idTipoDocumento,
        nombre: documento.nombre,
        url: `https://docs.bananotrace.test/${params.anio}/${documento.slug}/${documento.codigo}.pdf`,
        fechaCarga: conHoraLaboral(
          params.rng,
          sumarDias(params.fecha, enteroEntre(params.rng, 0, 2)),
        ),
      },
    });
  }
}

async function crearLoteVolumen(
  tx: Tx,
  ctx: FlujoContext,
  params: { etapa: Etapa; indice: number },
): Promise<void> {
  const { etapa, indice } = params;
  const rng = crearPRNG(1_000_003 + indice * 7919);

  const idUsuarioSupervisor = elegir(rng, ctx.usuarios.supervisores);
  const idUsuarioCalidad = elegir(rng, ctx.usuarios.calidad);
  const idUsuarioLogistica = elegir(rng, ctx.usuarios.logistica);
  const idVariedad = elegir(rng, ctx.variedades).idVariedad;
  const finca = elegirPonderado(
    rng,
    ctx.fincas,
    (f) => Math.max(f.areaHectareas, 1),
  );

  const cronograma = cronogramaPorEtapa(rng, etapa);
  const anioSiembra = cronograma.fechaSiembra.getUTCFullYear();
  const usarTriggerLote = anioSiembra >= 2026;
  const codigoLoteExplicito = usarTriggerLote
    ? ''
    : contadorLote.siguiente(anioSiembra, 'BAN');

  // Plantas correlacionadas con el área de la finca (densidad 1800-2400 plantas/ha).
  const densidad = (1800 + rng() * 600) * (0.9 + rng() * 0.2);
  const fraccionLote = randomEntre(rng, 0.08, 0.35);
  let cantidadPlantas = Math.round(
    finca.areaHectareas * densidad * fraccionLote,
  );
  if (cantidadPlantas < 800) {
    cantidadPlantas = Math.round(800 + rng() * 400);
  }
  if (cantidadPlantas > 3200 && finca.areaHectareas < 60) {
    cantidadPlantas = Math.round(800 + Math.pow(rng(), 2) * 2400);
  }
  if (cantidadPlantas < 1) cantidadPlantas = 800;

  const esPlanificado = etapa === 'PLANIFICADO';
  const fechaRegistroLote = esPlanificado ? hoy() : cronograma.fechaSiembra;

  const unidad = await tx.unidadTrazable.create({
    data: {
      tipo: TipoUnidadTrazable.LOTE,
      fechaRegistro: fechaRegistroLote,
      ...(codigoLoteExplicito ? { codigo: codigoLoteExplicito } : {}),
    },
    select: { idUnidad: true, codigo: true },
  });

  const lote = await tx.loteProduccion.create({
    data: {
      idUnidad: unidad.idUnidad,
      idFinca: finca.idFinca,
      idVariedad,
      fechaSiembra: cronograma.fechaSiembra,
      fechaEstimadaCosecha: cronograma.fechaEstimadaCosecha,
      cantidadPlantas,
      estado: esPlanificado ? EstadoLote.PLANIFICADO : EstadoLote.EN_PRODUCCION,
      fechaRegistro: fechaRegistroLote,
      ...(codigoLoteExplicito ? { codigoLote: codigoLoteExplicito } : {}),
    },
    select: { idLote: true, idUnidad: true, codigoLote: true },
  });
  await tx.unidadTrazable.update({
    where: { idUnidad: unidad.idUnidad },
    data: { codigo: lote.codigoLote },
  });

  if (esPlanificado) return;

  const { idInstancia, idEjecucion: execProduccionId } = await abrirFlujoUnidad(
    tx,
    {
      idUnidad: unidad.idUnidad,
      idFlujo: ctx.idFlujoPrincipal,
      codigoInstancia: `FLW-${lote.codigoLote}`,
      primeraFase: ctx.fasesPrincipales.PRODUCCION,
      fecha: cronograma.fechaSiembra,
      datosAdicionales: {
        responsable: 'Supervisor agrícola',
        actividad: 'Manejo agronómico del cultivo',
      },
    },
  );

  const transInicial = await tx.transicionEjecucion.create({
    data: {
      idEjecucion: execProduccionId,
      idUsuario: idUsuarioSupervisor,
      estadoAnterior: null,
      estadoNuevo: EstadoFlujo.EN_PROCESO,
      comentario: 'Inicio automático del flujo al crear el lote (seed)',
      fechaTransicion: conHoraLaboral(rng, cronograma.fechaSiembra),
      datosAdicionales: {
        motivo: 'Registro inicial de lote',
        responsable: 'Supervisor agrícola',
      },
    },
  });
  await registrarBloque(tx, { idInstancia, transicion: transInicial });

  // Evento de siembra + actividades de producción.
  if (ctx.tiposEvento.has('SIEMBRA')) {
    await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: unidad.idUnidad,
        idEjecucion: execProduccionId,
        idTipoEvento: ctx.tiposEvento.get('SIEMBRA')!,
        idUsuario: idUsuarioSupervisor,
        fechaEvento: conHoraLaboral(rng, cronograma.fechaSiembra),
        ubicacion: finca.nombre,
        descripcion: 'Registro de siembra del lote',
        datosAdicionales: {
          humedadRelativa: redondear(randomEntre(rng, 72, 88), 1),
          temperaturaAmbiente: redondear(randomEntre(rng, 24, 32), 1),
          responsable: 'Supervisor agrícola',
          equipo: `Cuadrilla de siembra ${enteroEntre(rng, 1, 12)}`,
        },
        fechaRegistro: cronograma.fechaSiembra,
      },
    });
  }

  const tiposProduccion = [
    { nombre: 'RIEGO', descripcion: 'Riego programado del lote' },
    {
      nombre: 'FERTILIZACION',
      descripcion: 'Aplicación de fertilizante foliar',
    },
    {
      nombre: 'FUMIGACION',
      descripcion: 'Control fitosanitario preventivo',
    },
    {
      nombre: 'INSPECCION_CAMPO',
      descripcion: 'Inspección del estado del cultivo',
    },
  ].filter((tipo) => ctx.tiposEvento.has(tipo.nombre));

  const topeProduccion = cronograma.fechaCosecha ?? hoy();
  const diasProduccion = Math.max(
    30,
    Math.round(
      (topeProduccion.getTime() - cronograma.fechaSiembra.getTime()) /
        86_400_000,
    ),
  );
  const nEventosProduccion = enteroEntre(rng, 1, 3);
  for (let e = 0; e < nEventosProduccion; e++) {
    const tipo = elegir(rng, tiposProduccion);
    const fecha = sumarDias(
      cronograma.fechaSiembra,
      enteroEntre(rng, 15, Math.max(20, diasProduccion - 5)),
    );
    if (fecha.getTime() > topeProduccion.getTime()) continue;
    await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: unidad.idUnidad,
        idEjecucion: execProduccionId,
        idTipoEvento: ctx.tiposEvento.get(tipo.nombre)!,
        idUsuario: idUsuarioSupervisor,
        fechaEvento: conHoraLaboral(rng, fecha),
        ubicacion: finca.nombre,
        descripcion: tipo.descripcion,
        datosAdicionales: {
          humedadRelativa: redondear(randomEntre(rng, 70, 90), 1),
          temperaturaAmbiente: redondear(randomEntre(rng, 22, 34), 1),
          responsable: 'Supervisor agrícola',
          producto: 'Dosis estándar del programa de manejo',
        },
        fechaRegistro: fecha,
      },
    });
  }

  if (etapa === 'EN_PRODUCCION') return;

  // Cosecha: peso con factor de rendimiento variable (tendencia + estacionalidad + outliers).
  const anioCosecha = cronograma.fechaCosecha!.getUTCFullYear();
  const mesCosecha = cronograma.fechaCosecha!.getUTCMonth();
  let factorRendimiento = clip(normal(rng, 22, 3), 13, 32);
  factorRendimiento *= 1 + 0.06 * (anioCosecha - 2024);
  factorRendimiento *= 1 + (factorMes(mesCosecha) - 1) * 0.3;
  const rollFactor = rng();
  if (rollFactor < 0.015) {
    factorRendimiento = randomEntre(rng, 14, 16);
  } else if (rollFactor > 0.985) {
    factorRendimiento = randomEntre(rng, 28, 30);
  }
  factorRendimiento = clip(factorRendimiento, 13, 34);
  const pesoCosechadoKg = new Prisma.Decimal(
    redondear(cantidadPlantas * factorRendimiento, 2),
  );

  await tx.loteProduccion.update({
    where: { idLote: lote.idLote },
    data: {
      fechaCosecha: cronograma.fechaCosecha!,
      pesoCosechadoKg,
    },
  });

  if (ctx.tiposEvento.has('COSECHA')) {
    await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: unidad.idUnidad,
        idEjecucion: execProduccionId,
        idTipoEvento: ctx.tiposEvento.get('COSECHA')!,
        idUsuario: idUsuarioSupervisor,
        fechaEvento: conHoraLaboral(rng, cronograma.fechaCosecha!),
        ubicacion: finca.nombre,
        descripcion: 'Corte y recolección de racimos del lote',
        datosAdicionales: {
          humedadRelativa: redondear(randomEntre(rng, 70, 92), 1),
          temperaturaAmbiente: redondear(randomEntre(rng, 23, 31), 1),
          responsable: 'Jefe de cosecha',
          equipo: `Cuadrilla de cosecha ${enteroEntre(rng, 1, 10)}`,
          numRacimos: enteroEntre(rng, 90, 220),
        },
        fechaRegistro: cronograma.fechaCosecha!,
      },
    });
  }

  const execCalidadId = await avanzarLote(tx, {
    idLote: lote.idLote,
    idInstancia,
    idFlujo: ctx.idFlujoPrincipal,
    faseActual: { execId: execProduccionId, info: ctx.fasesPrincipales.PRODUCCION },
    siguienteFase: ctx.fasesPrincipales.CALIDAD,
    idUsuario: idUsuarioSupervisor,
    fecha: conHoraLaboral(rng, cronograma.fechaCosecha!),
    comentario: 'Cosecha completada (seed)',
    datosAdicionales: { motivo: 'Cosecha registrada', responsable: 'Supervisor agrícola' },
  });
  if (!execCalidadId) return;

  if (etapa === 'COSECHADO') return;

  if (ctx.tiposEvento.has('RECEPCION')) {
    await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: unidad.idUnidad,
        idEjecucion: execCalidadId,
        idTipoEvento: ctx.tiposEvento.get('RECEPCION')!,
        idUsuario: idUsuarioCalidad,
        fechaEvento: conHoraLaboral(rng, cronograma.fechaControl!),
        ubicacion: finca.nombre,
        descripcion: 'Recepción de racimos en la empacadora',
        datosAdicionales: {
          pesoBrutoKg: redondear(randomEntre(rng, 800, 4000), 0),
          temperaturaPulpa: redondear(randomEntre(rng, 13, 16), 1),
          responsable: 'Inspector de calidad',
        },
        fechaRegistro: cronograma.fechaControl!,
      },
    });
  }

  // Control de calidad (resultado coherente con el porcentaje de rechazo).
  const esRechazado = etapa === 'CALIDAD_RECHAZADO';
  const resultado = esRechazado
    ? ResultadoControl.RECHAZADO
    : etapa === 'CALIDAD'
      ? rng() < 0.6
        ? ResultadoControl.APROBADO
        : ResultadoControl.OBSERVADO
      : rng() < 0.7
        ? ResultadoControl.APROBADO
        : ResultadoControl.OBSERVADO;

  const pesoMuestraKg = redondear(clip(normal(rng, 20, 2), 15, 25), 2);
  const mesControl = cronograma.fechaControl!.getUTCMonth();
  const mesDesfavorable =
    (mesControl >= 1 && mesControl <= 4) || mesControl === 6 || mesControl === 7;
  let porcentajeRechazo: number;
  if (esRechazado) {
    porcentajeRechazo = redondear(randomEntre(rng, 10, 25), 2);
  } else if (resultado === ResultadoControl.OBSERVADO) {
    porcentajeRechazo = redondear(
      mesDesfavorable ? randomEntre(rng, 8, 10) : randomEntre(rng, 5, 10),
      2,
    );
  } else {
    porcentajeRechazo = redondear(
      clip(normal(rng, 2.2, 1.2) * (mesDesfavorable ? 1.5 : 1), 0.3, 5),
      2,
    );
  }

  let calibre = clip(normal(rng, 39.5, 2.2), 32, 46);
  const rollCalibre = rng();
  if (rollCalibre < 0.015) {
    calibre = randomEntre(rng, 28, 31.5);
  } else if (rollCalibre > 0.985) {
    calibre = randomEntre(rng, 45.5, 47.5);
  }

  await tx.controlCalidad.create({
    data: {
      idEjecucion: execCalidadId,
      idLote: lote.idLote,
      idUsuario: idUsuarioCalidad,
      idCategoriaCalidad: elegir(rng, ctx.categorias).idCategoriaCalidad,
      calibreMm: new Prisma.Decimal(redondear(calibre, 2)),
      pesoMuestraKg: new Prisma.Decimal(pesoMuestraKg),
      porcentajeRechazo: new Prisma.Decimal(porcentajeRechazo),
      resultado,
      fechaControl: conHoraLaboral(rng, cronograma.fechaControl!),
      observaciones: observar(rng, resultado),
    },
  });

  if (ctx.tiposEvento.has('CONTROL_CALIDAD')) {
    await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: unidad.idUnidad,
        idEjecucion: execCalidadId,
        idTipoEvento: ctx.tiposEvento.get('CONTROL_CALIDAD')!,
        idUsuario: idUsuarioCalidad,
        fechaEvento: conHoraLaboral(rng, cronograma.fechaControl!),
        ubicacion: finca.nombre,
        descripcion: 'Inspección de calidad e inocuidad del lote',
        datosAdicionales: {
          turno: elegir(rng, ['Matutino', 'Vespertino']),
          nroInspectores: enteroEntre(rng, 2, 5),
          temperaturaAmbiente: redondear(randomEntre(rng, 22, 30), 1),
          resultado: resultado,
          responsable: 'Inspector de calidad',
        },
        fechaRegistro: cronograma.fechaControl!,
      },
    });
  }

  if (esRechazado || etapa === 'CALIDAD') return;

  // Empaque.
  const execEmpaqueId = await avanzarLote(tx, {
    idLote: lote.idLote,
    idInstancia,
    idFlujo: ctx.idFlujoPrincipal,
    faseActual: { execId: execCalidadId, info: ctx.fasesPrincipales.CALIDAD },
    siguienteFase: ctx.fasesPrincipales.EMPAQUE,
    idUsuario: idUsuarioCalidad,
    fecha: conHoraLaboral(rng, cronograma.fechaControl!),
    comentario: 'Control de calidad aprobado (seed)',
    datosAdicionales: { motivo: 'Calidad aprobada', responsable: 'Inspector de calidad' },
    fechaSiguienteFase: conHoraLaboral(rng, cronograma.fechaEmpaque!),
  });
  if (!execEmpaqueId) return;

  const anioEmpaque = cronograma.fechaEmpaque!.getUTCFullYear();
  const usarTriggerEmpaque = anioEmpaque >= 2026;
  const numEmpaques = enteroEntre(
    rng,
    1,
    Math.min(5, 1 + Math.floor(cantidadPlantas / 800)),
  );

  const empaques: Array<{
    idEmpaque: bigint;
    idUnidad: bigint;
    idInstancia: bigint;
    idEjecucion: bigint;
  }> = [];

  for (let e = 0; e < numEmpaques; e++) {
    const codigoCajaExplicito = usarTriggerEmpaque
      ? ''
      : contadorEmpaque.siguiente(anioEmpaque, 'CAJ');
    const unidadEmpaque = await tx.unidadTrazable.create({
      data: {
        tipo: TipoUnidadTrazable.EMPAQUE,
        fechaRegistro: cronograma.fechaEmpaque!,
        ...(codigoCajaExplicito ? { codigo: codigoCajaExplicito } : {}),
      },
      select: { idUnidad: true, codigo: true },
    });

    let pesoNeto = clip(normal(rng, 18.14, 0.45), 17.0, 19.8);
    if (rng() < 0.03) {
      pesoNeto = randomEntre(rng, 17.0, 17.3);
    }

    const empaque = await tx.empaque.create({
      data: {
        idUnidad: unidadEmpaque.idUnidad,
        idEjecucion: execEmpaqueId,
        idLote: lote.idLote,
        idCategoriaCalidad: elegir(rng, ctx.categorias).idCategoriaCalidad,
        fechaEmpaque: cronograma.fechaEmpaque!,
        ...(codigoCajaExplicito ? { codigoCaja: codigoCajaExplicito } : {}),
        pesoNetoKg: new Prisma.Decimal(redondear(pesoNeto, 2)),
        codigoQr: `QR-${unidadEmpaque.codigo}`,
        estado: EstadoEmpaque.DISPONIBLE,
      },
      select: { idEmpaque: true, idUnidad: true },
    });

    const flujoEmpaque = await abrirFlujoUnidad(tx, {
      idUnidad: unidadEmpaque.idUnidad,
      idFlujo: ctx.idFlujoEmpaque,
      codigoInstancia: `FLW-${unidadEmpaque.codigo}`,
      primeraFase: ctx.fasesEmpaque[0],
      fecha: cronograma.fechaEmpaque!,
      idResponsable: idUsuarioLogistica,
      estadoInstancia: EstadoFlujo.EN_PROCESO,
      datosAdicionales: {
        linea: `Línea ${enteroEntre(rng, 1, 4)}`,
        operador: `Cuadrilla ${enteroEntre(rng, 1, 8)}`,
      },
    });
    empaques.push({
      idEmpaque: empaque.idEmpaque,
      idUnidad: empaque.idUnidad,
      idInstancia: flujoEmpaque.idInstancia,
      idEjecucion: flujoEmpaque.idEjecucion,
    });
  }

  if (ctx.tiposEvento.has('EMPACADO')) {
    await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: unidad.idUnidad,
        idEjecucion: execEmpaqueId,
        idTipoEvento: ctx.tiposEvento.get('EMPACADO')!,
        idUsuario: idUsuarioCalidad,
        fechaEvento: conHoraLaboral(rng, cronograma.fechaEmpaque!),
        ubicacion: finca.nombre,
        descripcion: 'Lavado, selección y empaque del lote',
        datosAdicionales: {
          linea: `Línea ${enteroEntre(rng, 1, 4)}`,
          numCajas: numEmpaques,
          operador: `Cuadrilla ${enteroEntre(rng, 1, 8)}`,
          responsable: 'Jefe de empaque',
        },
        fechaRegistro: cronograma.fechaEmpaque!,
      },
    });
  }

  const execLogisticaId = await avanzarLote(tx, {
    idLote: lote.idLote,
    idInstancia,
    idFlujo: ctx.idFlujoPrincipal,
    faseActual: { execId: execEmpaqueId, info: ctx.fasesPrincipales.EMPAQUE },
    siguienteFase: ctx.fasesPrincipales.LOGISTICA,
    idUsuario: idUsuarioCalidad,
    fecha: conHoraLaboral(rng, cronograma.fechaSalida!),
    comentario: 'Empaque completado (seed)',
    datosAdicionales: { motivo: 'Cajas listas para embarque', responsable: 'Jefe de empaque' },
  });
  if (!execLogisticaId) return;

  // Envío.
  const naviera = elegir(rng, ctx.navieras);
  const puertoOrigen = elegir(rng, ctx.puertosOrigen);
  const puertoDestino = elegir(rng, ctx.puertosDestino);
  const anioSalida = cronograma.fechaSalida!.getUTCFullYear();
  const usarTriggerEnvio = anioSalida >= 2026;
  const codigoEnvioExplicito = usarTriggerEnvio
    ? ''
    : contadorEnvio.siguiente(anioSalida, 'ENV');
  const numeroContenedor = `CONT-${anioSalida}-${enteroEntre(rng, 1000, 9999)}`;

  const mesSalida = cronograma.fechaSalida!.getUTCMonth();
  const estacionalTemperatura =
    0.6 * Math.sin((2 * Math.PI * (mesSalida - 2)) / 12);
  let temperaturaSalida = 13.2 + estacionalTemperatura + normal(rng, 0, 0.35);
  temperaturaSalida = clip(temperaturaSalida, 12.2, 14.8);
  if (rng() < 0.02) {
    temperaturaSalida = randomEntre(rng, 15.0, 15.8);
  }

  const fechaEstimadaLlegada =
    etapa === 'CERRADO' && cronograma.fechaEntrega
      ? restarDias(cronograma.fechaEntrega, enteroEntre(rng, 0, 5))
      : sumarDias(cronograma.fechaSalida!, enteroEntre(rng, 15, 28));

  const unidadEnvio = await tx.unidadTrazable.create({
    data: {
      tipo: TipoUnidadTrazable.ENVIO,
      fechaRegistro: cronograma.fechaSalida!,
      ...(codigoEnvioExplicito ? { codigo: codigoEnvioExplicito } : {}),
    },
    select: { idUnidad: true, codigo: true },
  });

  const envio = await tx.envio.create({
    data: {
      idUnidad: unidadEnvio.idUnidad,
      idEjecucion: execLogisticaId,
      idNaviera: naviera.idNaviera,
      idPuertoOrigen: puertoOrigen.idPuerto,
      idPuertoDestino: puertoDestino.idPuerto,
      ...(codigoEnvioExplicito ? { codigoEnvio: codigoEnvioExplicito } : {}),
      numeroContenedor,
      fechaSalida: cronograma.fechaSalida!,
      fechaEstimadaLlegada,
      temperaturaSalida: new Prisma.Decimal(redondear(temperaturaSalida, 2)),
      estado: EstadoEnvio.PLANIFICADO,
    },
    select: { idEnvio: true, codigoEnvio: true },
  });
  await tx.unidadTrazable.update({
    where: { idUnidad: unidadEnvio.idUnidad },
    data: { codigo: envio.codigoEnvio },
  });

  const flujoEnvio = await abrirFlujoUnidad(tx, {
    idUnidad: unidadEnvio.idUnidad,
    idFlujo: ctx.idFlujoEnvio,
    codigoInstancia: `FLW-${unidadEnvio.codigo}`,
    primeraFase: ctx.fasesEnvio[0],
    fecha: cronograma.fechaSalida!,
    idResponsable: idUsuarioLogistica,
    estadoInstancia: EstadoFlujo.EN_PROCESO,
    datosAdicionales: {
      terminal: 'Puerto Bolívar',
      contenedor: numeroContenedor,
    },
  });

  await tx.envioEmpaque.createMany({
    data: empaques.map((empaque) => ({
      idEnvio: envio.idEnvio,
      idEmpaque: empaque.idEmpaque,
    })),
  });

  if (etapa === 'EMPACADO') return;

  if (ctx.tiposEvento.has('TRANSPORTE')) {
    await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: unidad.idUnidad,
        idEjecucion: execLogisticaId,
        idTipoEvento: ctx.tiposEvento.get('TRANSPORTE')!,
        idUsuario: idUsuarioLogistica,
        fechaEvento: conHoraLaboral(rng, cronograma.fechaCargado!),
        ubicacion: 'Puerto Bolívar',
        descripcion: 'Traslado de contenedor al puerto de embarque',
        datosAdicionales: {
          placa: `PLACA-${enteroEntre(rng, 1000, 9999)}`,
          conductor: 'Transporte contratado',
          temperaturaContenedor: redondear(temperaturaSalida, 1),
          responsable: 'Jefe de logística',
        },
        fechaRegistro: cronograma.fechaCargado!,
      },
    });
  }

  if (ctx.tiposEvento.has('EXPORTACION')) {
    const eventoExportacion = await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: unidad.idUnidad,
        idEjecucion: execLogisticaId,
        idTipoEvento: ctx.tiposEvento.get('EXPORTACION')!,
        idUsuario: idUsuarioLogistica,
        fechaEvento: conHoraLaboral(rng, cronograma.fechaSalida!),
        ubicacion: 'Puerto Bolívar',
        descripcion: 'Embarque del contenedor para exportación',
        datosAdicionales: {
          naviera: naviera.codigo ?? 'Naviera contratada',
          contenedor: numeroContenedor,
          sello: `SEAL-${enteroEntre(rng, 10000, 99999)}`,
          responsable: 'Agente de carga',
        },
        fechaRegistro: cronograma.fechaSalida!,
      },
      select: { idEvento: true },
    });

    await crearDocumentos(tx, ctx, {
      lote: lote.codigoLote,
      envio: envio.codigoEnvio,
      contenedor: numeroContenedor,
      eventoId: eventoExportacion.idEvento,
      anio: anioSalida,
      fecha: cronograma.fechaSalida!,
      rng,
    });
  }

  // Avances de envío/cajas hasta EXPORTADO (2 pasos) o CERRADO (3 pasos).
  const pasosDestino = etapa === 'CERRADO' ? 3 : 2;
  const fechasPasos =
    etapa === 'CERRADO'
      ? [
          cronograma.fechaCargado!,
          cronograma.fechaTransito!,
          cronograma.fechaEntrega!,
        ]
      : [cronograma.fechaCargado!, cronograma.fechaTransito!];

  let execEnvioActualId = flujoEnvio.idEjecucion;
  const execEmpaquesActuales = new Map<bigint, bigint>(
    empaques.map((empaque) => [empaque.idUnidad, empaque.idEjecucion]),
  );

  for (let paso = 0; paso < pasosDestino; paso++) {
    const fechaPaso = conHoraLaboral(rng, fechasPasos[paso]);
    const resultadoEnvio = await avanzarUnidadFlujo(tx, {
      idInstancia: flujoEnvio.idInstancia,
      idFlujo: ctx.idFlujoEnvio,
      faseActualExecId: execEnvioActualId,
      siguienteFase: ctx.fasesEnvio[paso + 1],
      esTerminal: paso + 1 === ctx.fasesEnvio.length - 1,
      idUsuario: idUsuarioLogistica,
      fecha: fechaPaso,
      datosAdicionales: {
        motivo: 'Avance automático de envío (seed)',
        responsable: 'Jefe de logística',
      },
    });
    execEnvioActualId = resultadoEnvio.nuevaEjecucionId;

    for (const empaque of empaques) {
      const execActual = execEmpaquesActuales.get(empaque.idUnidad)!;
      const resultadoEmpaque = await avanzarUnidadFlujo(tx, {
        idInstancia: empaque.idInstancia,
        idFlujo: ctx.idFlujoEmpaque,
        faseActualExecId: execActual,
        siguienteFase: ctx.fasesEmpaque[paso + 1],
        esTerminal: paso + 1 === ctx.fasesEmpaque.length - 1,
        idUsuario: idUsuarioLogistica,
        fecha: fechaPaso,
        datosAdicionales: {
          motivo: 'Avance automático de caja (seed)',
          responsable: 'Jefe de logística',
        },
      });
      execEmpaquesActuales.set(empaque.idUnidad, resultadoEmpaque.nuevaEjecucionId);
      await tx.empaque.update({
        where: { idEmpaque: empaque.idEmpaque },
        data: { estado: resultadoEmpaque.codigo as EstadoEmpaque },
      });
    }
  }

  await tx.envio.update({
    where: { idEnvio: envio.idEnvio },
    data: { estado: ctx.fasesEnvio[pasosDestino].codigo as EstadoEnvio },
  });

  const fechaFinLogistica =
    etapa === 'CERRADO' ? cronograma.fechaEntrega! : cronograma.fechaTransito!;
  await avanzarLote(tx, {
    idLote: lote.idLote,
    idInstancia,
    idFlujo: ctx.idFlujoPrincipal,
    faseActual: { execId: execLogisticaId, info: ctx.fasesPrincipales.LOGISTICA },
    siguienteFase: null,
    idUsuario: idUsuarioLogistica,
    fecha: conHoraLaboral(rng, fechaFinLogistica),
    comentario: 'Exportación completada (seed)',
    datosAdicionales: {
      motivo: 'Exportación finalizada',
      responsable: 'Jefe de logística',
    },
  });

  if (etapa === 'CERRADO') {
    await tx.loteProduccion.update({
      where: { idLote: lote.idLote },
      data: { estado: EstadoLote.CERRADO },
    });
  }
}

export async function seedLotesVolumen(
  prisma: PrismaClient,
  productores: ProductorVolumen[],
  usuarios: UsuariosVolumen,
): Promise<void> {
  const existentes = await prisma.loteProduccion.count();
  if (existentes >= OBJETIVO_LOTES) {
    console.log('✅ Lotes de volumen ya sembrados, se omite.');
    return;
  }

  const [flujo, variedades, categorias, navieras, puertos, tiposEvento, tiposDocumento] =
    await Promise.all([
      prisma.flujo.findFirst({
        where: { codigo: 'TRAZABILIDAD_BANANO_EXPORT' },
        select: {
          idFlujo: true,
          fases: {
            select: {
              idFase: true,
              codigo: true,
              estadoLoteInicio: true,
              estadoLoteFin: true,
            },
            orderBy: { orden: 'asc' },
          },
        },
      }),
      prisma.variedad.findMany({ select: { idVariedad: true } }),
      prisma.categoriaCalidad.findMany({ select: { idCategoriaCalidad: true } }),
      prisma.naviera.findMany({
        where: { activo: true },
        select: { idNaviera: true, codigo: true },
      }),
      prisma.puerto.findMany({
        select: { idPuerto: true, paisNombre: true },
      }),
      prisma.tipoEvento.findMany({ select: { idTipoEvento: true, nombre: true } }),
      prisma.tipoDocumento.findMany({
        select: { idTipoDocumento: true, codigo: true, nombre: true },
      }),
    ]);

  if (!flujo) {
    throw new Error('Flujo principal TRAZABILIDAD_BANANO_EXPORT no encontrado');
  }

  const fases = flujo.fases;
  const fasesPrincipales = {
    PRODUCCION: fases.find((f) => f.codigo === 'PRODUCCION')!,
    CALIDAD: fases.find((f) => f.codigo === 'CALIDAD')!,
    EMPAQUE: fases.find((f) => f.codigo === 'EMPAQUE')!,
    LOGISTICA: fases.find((f) => f.codigo === 'LOGISTICA')!,
  };

  const SELECT_FLUJO_FASES = {
    idFlujo: true,
    fases: { select: { idFase: true, codigo: true }, orderBy: { orden: 'asc' } },
  } as const;

  const flujoEmpaque = await prisma.flujo.findFirst({
    where: { codigo: 'EMPAQUE_FLUJO', activo: true },
    select: SELECT_FLUJO_FASES,
  });
  if (!flujoEmpaque) {
    throw new Error('Flujo EMPAQUE_FLUJO no encontrado');
  }

  const flujoEnvio = await prisma.flujo.findFirst({
    where: { codigo: 'ENVIO_FLUJO', activo: true },
    select: SELECT_FLUJO_FASES,
  });
  if (!flujoEnvio) {
    throw new Error('Flujo ENVIO_FLUJO no encontrado');
  }

  const tiposEventoMap = new Map<string, number>(
    tiposEvento.map((t) => [t.nombre, t.idTipoEvento]),
  );

  const ctx: FlujoContext = {
    idFlujoPrincipal: flujo.idFlujo,
    fasesPrincipales,
    idFlujoEmpaque: flujoEmpaque!.idFlujo,
    fasesEmpaque: flujoEmpaque!.fases as FaseSimple[],
    idFlujoEnvio: flujoEnvio!.idFlujo,
    fasesEnvio: flujoEnvio!.fases as FaseSimple[],
    variedades,
    categorias,
    navieras,
    puertosOrigen: puertos.filter((p) => p.paisNombre === 'Ecuador'),
    puertosDestino: puertos.filter((p) => p.paisNombre !== 'Ecuador'),
    tiposEvento: tiposEventoMap,
    tiposDocumento,
    fincas: productores.flatMap((productor) => productor.fincas),
    usuarios,
  };

  if (ctx.puertosOrigen.length === 0 || ctx.puertosDestino.length === 0) {
    throw new Error('Se requieren puertos de origen y destino para los envíos');
  }

  let secuenciaEtapas: Etapa[] = [];
  for (const item of DISTRIBUCION) {
    for (let k = 0; k < item.cantidad; k++) {
      secuenciaEtapas.push(item.etapa);
    }
  }
  const rngShuffle = crearPRNG(0xbe47);
  for (let i = secuenciaEtapas.length - 1; i > 0; i--) {
    const j = Math.floor(rngShuffle() * (i + 1));
    [secuenciaEtapas[i], secuenciaEtapas[j]] = [secuenciaEtapas[j], secuenciaEtapas[i]];
  }

  let indice = 0;
  for (const etapa of secuenciaEtapas) {
    await prisma.$transaction(async (tx) => {
      await crearLoteVolumen(tx, ctx, { etapa, indice });
    }, { timeout: 60_000 });
    indice += 1;
  }

  console.log(`✅ Lotes de volumen sembrados: ${indice}.`);
}
