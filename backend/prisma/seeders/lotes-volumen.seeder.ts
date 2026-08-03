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
import type { ProductorVolumen } from './productores-fincas-volumen.seeder';
import type { UsuariosVolumen } from './usuarios-volumen.seeder';

type Tx = Prisma.TransactionClient;

const OBJETIVO_LOTES = 240;

/** Distribución de estados finales que debe alcanzar cada lote sembrado, en el mismo orden en que se recorren. */
const DISTRIBUCION: Array<{ etapa: Etapa; cantidad: number }> = [
  { etapa: 'EN_PRODUCCION', cantidad: 36 },
  { etapa: 'CALIDAD', cantidad: 36 },
  { etapa: 'CALIDAD_RECHAZADO', cantidad: 24 },
  { etapa: 'EMPACADO', cantidad: 48 },
  { etapa: 'EXPORTADO', cantidad: 60 },
  { etapa: 'CERRADO', cantidad: 36 },
];

type Etapa =
  | 'EN_PRODUCCION'
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

interface FlujoContext {
  idFlujoPrincipal: number;
  fasesPrincipales: Record<'PRODUCCION' | 'CALIDAD' | 'EMPAQUE' | 'LOGISTICA', FaseLote>;
  idFlujoEmpaque: number;
  fasesEmpaque: FaseSimple[];
  idFlujoEnvio: number;
  fasesEnvio: FaseSimple[];
  variedades: Array<{ idVariedad: number }>;
  categorias: Array<{ idCategoriaCalidad: number }>;
  navieras: Array<{ idNaviera: number }>;
  puertos: Array<{ idPuerto: number }>;
  idTipoSiembra: number | null;
  idTipoCosecha: number | null;
  usuarios: UsuariosVolumen;
}

function fechaHaceDias(dias: number): Date {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha;
}

function elegir<T>(lista: T[], indice: number): T {
  return lista[indice % lista.length];
}

/** Completa la ejecución de fase actual del lote, registra su bloque, y abre la siguiente (o cierra el flujo si es terminal). */
async function avanzarLote(
  tx: Tx,
  params: {
    idLote: bigint;
    idInstancia: bigint;
    idFlujo: number;
    faseActual: { execId: bigint; info: FaseLote };
    siguienteFase: FaseLote | null;
    idUsuario: bigint;
    fecha: Date;
    comentario: string;
  },
): Promise<bigint | null> {
  await tx.faseEjecucion.update({
    where: { idEjecucion: params.faseActual.execId },
    data: { estado: EstadoFlujo.COMPLETADO, fechaFin: params.fecha },
  });
  const transActual = await tx.transicionEjecucion.create({
    data: {
      idEjecucion: params.faseActual.execId,
      idUsuario: params.idUsuario,
      estadoAnterior: EstadoFlujo.EN_PROCESO,
      estadoNuevo: EstadoFlujo.COMPLETADO,
      comentario: params.comentario,
    },
  });
  await registrarBloque(tx, { idInstancia: params.idInstancia, transicion: transActual });

  if (!params.siguienteFase) {
    await tx.flujoInstancia.update({
      where: { idInstancia: params.idInstancia },
      data: { estado: EstadoFlujo.COMPLETADO, fechaFin: params.fecha },
    });
    if (params.faseActual.info.estadoLoteFin) {
      await tx.loteProduccion.update({
        where: { idLote: params.idLote },
        data: { estado: params.faseActual.info.estadoLoteFin },
      });
    }
    return null;
  }

  const nuevaEjecucion = await tx.faseEjecucion.create({
    data: {
      idInstancia: params.idInstancia,
      idFase: params.siguienteFase.idFase,
      idFlujo: params.idFlujo,
      estado: EstadoFlujo.EN_PROCESO,
      fechaInicio: params.fecha,
    },
    select: { idEjecucion: true },
  });
  const transSiguiente = await tx.transicionEjecucion.create({
    data: {
      idEjecucion: nuevaEjecucion.idEjecucion,
      idUsuario: params.idUsuario,
      estadoAnterior: null,
      estadoNuevo: EstadoFlujo.EN_PROCESO,
      comentario: 'Avance automático de fase (seed)',
    },
  });
  await registrarBloque(tx, { idInstancia: params.idInstancia, transicion: transSiguiente });
  if (params.siguienteFase.estadoLoteInicio) {
    await tx.loteProduccion.update({
      where: { idLote: params.idLote },
      data: { estado: params.siguienteFase.estadoLoteInicio },
    });
  }
  return nuevaEjecucion.idEjecucion;
}

/** Igual que `avanzarLote` pero para las unidades EMPAQUE/ENVIO, cuyo estado se deriva directamente del código de la fase destino. */
async function avanzarUnidadFlujo(
  tx: Tx,
  params: {
    idInstancia: bigint;
    idFlujo: number;
    faseActualExecId: bigint;
    siguienteFase: FaseSimple;
    esTerminal: boolean;
    idUsuario: bigint;
    fecha: Date;
  },
): Promise<{ nuevaEjecucionId: bigint; codigo: string }> {
  await tx.faseEjecucion.update({
    where: { idEjecucion: params.faseActualExecId },
    data: { estado: EstadoFlujo.COMPLETADO, fechaFin: params.fecha },
  });
  const transActual = await tx.transicionEjecucion.create({
    data: {
      idEjecucion: params.faseActualExecId,
      idUsuario: params.idUsuario,
      estadoAnterior: EstadoFlujo.EN_PROCESO,
      estadoNuevo: EstadoFlujo.COMPLETADO,
      comentario: 'Avance automático de fase (seed)',
    },
  });
  await registrarBloque(tx, { idInstancia: params.idInstancia, transicion: transActual });

  const nuevoEstado = params.esTerminal ? EstadoFlujo.COMPLETADO : EstadoFlujo.EN_PROCESO;
  const nuevaEjecucion = await tx.faseEjecucion.create({
    data: {
      idInstancia: params.idInstancia,
      idFase: params.siguienteFase.idFase,
      idFlujo: params.idFlujo,
      estado: nuevoEstado,
      fechaInicio: params.fecha,
      fechaFin: params.esTerminal ? params.fecha : null,
    },
    select: { idEjecucion: true },
  });
  const transSiguiente = await tx.transicionEjecucion.create({
    data: {
      idEjecucion: nuevaEjecucion.idEjecucion,
      idUsuario: params.idUsuario,
      estadoAnterior: null,
      estadoNuevo: nuevoEstado,
      comentario: 'Avance automático de fase (seed)',
    },
  });
  await registrarBloque(tx, { idInstancia: params.idInstancia, transicion: transSiguiente });

  if (params.esTerminal) {
    await tx.flujoInstancia.update({
      where: { idInstancia: params.idInstancia },
      data: { estado: EstadoFlujo.COMPLETADO, fechaFin: params.fecha },
    });
  }
  return { nuevaEjecucionId: nuevaEjecucion.idEjecucion, codigo: params.siguienteFase.codigo };
}

/** Crea una unidad trazable con su instancia de flujo y primera fase, y devuelve los identificadores para seguir operando sobre ella. */
async function abrirFlujoUnidad(
  tx: Tx,
  params: {
    idUnidad: bigint;
    idFlujo: number;
    codigoInstancia: string;
    primeraFase: { idFase: number };
    fecha: Date;
  },
): Promise<{ idInstancia: bigint; idEjecucion: bigint }> {
  const instancia = await tx.flujoInstancia.create({
    data: {
      idFlujo: params.idFlujo,
      codigo: params.codigoInstancia,
      estado: EstadoFlujo.EN_PROCESO,
      fechaInicio: params.fecha,
      unidades: { create: { idUnidad: params.idUnidad, rol: RolUnidadFlujo.PRINCIPAL } },
    },
    select: { idInstancia: true },
  });
  const ejecucion = await tx.faseEjecucion.create({
    data: {
      idInstancia: instancia.idInstancia,
      idFase: params.primeraFase.idFase,
      idFlujo: params.idFlujo,
      estado: EstadoFlujo.EN_PROCESO,
      fechaInicio: params.fecha,
    },
    select: { idEjecucion: true },
  });
  return { idInstancia: instancia.idInstancia, idEjecucion: ejecucion.idEjecucion };
}

async function crearLoteVolumen(
  tx: Tx,
  ctx: FlujoContext,
  params: { idFinca: bigint; etapa: Etapa; indice: number },
): Promise<void> {
  const { indice, etapa } = params;
  const idUsuarioSupervisor = elegir(ctx.usuarios.supervisores, indice);
  const idUsuarioCalidad = elegir(ctx.usuarios.calidad, indice);
  const idUsuarioLogistica = elegir(ctx.usuarios.logistica, indice);
  const idVariedad = elegir(ctx.variedades, indice).idVariedad;

  const fechaSiembra = fechaHaceDias(60 + (indice % 340));
  const cantidadPlantas = 800 + (indice % 23) * 90;

  const unidad = await tx.unidadTrazable.create({
    data: { tipo: TipoUnidadTrazable.LOTE },
    select: { idUnidad: true },
  });
  const lote = await tx.loteProduccion.create({
    data: {
      idUnidad: unidad.idUnidad,
      idFinca: params.idFinca,
      idVariedad,
      fechaSiembra,
      cantidadPlantas,
      estado: EstadoLote.EN_PRODUCCION,
    },
    select: { idLote: true, idUnidad: true, codigoLote: true },
  });
  await tx.unidadTrazable.update({
    where: { idUnidad: unidad.idUnidad },
    data: { codigo: lote.codigoLote },
  });

  const { idInstancia, idEjecucion: execProduccionId } = await abrirFlujoUnidad(tx, {
    idUnidad: unidad.idUnidad,
    idFlujo: ctx.idFlujoPrincipal,
    codigoInstancia: `FLW-${lote.codigoLote}`,
    primeraFase: ctx.fasesPrincipales.PRODUCCION,
    fecha: fechaSiembra,
  });
  const transInicial = await tx.transicionEjecucion.create({
    data: {
      idEjecucion: execProduccionId,
      idUsuario: idUsuarioSupervisor,
      estadoAnterior: null,
      estadoNuevo: EstadoFlujo.EN_PROCESO,
      comentario: 'Inicio automático del flujo al crear el lote (seed)',
    },
  });
  await registrarBloque(tx, { idInstancia, transicion: transInicial });

  if (ctx.idTipoSiembra) {
    await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: unidad.idUnidad,
        idEjecucion: execProduccionId,
        idTipoEvento: ctx.idTipoSiembra,
        idUsuario: idUsuarioSupervisor,
        fechaEvento: fechaSiembra,
        descripcion: 'Registro de siembra (seed)',
      },
    });
  }

  if (etapa === 'EN_PRODUCCION') return;

  const fechaCosecha = fechaHaceDias(60 + (indice % 340) - 80);
  const pesoCosechadoKg = new Prisma.Decimal(cantidadPlantas * 20);
  await tx.loteProduccion.update({
    where: { idLote: lote.idLote },
    data: { fechaCosecha, pesoCosechadoKg },
  });
  if (ctx.idTipoCosecha) {
    await tx.eventoTrazabilidad.create({
      data: {
        idUnidad: unidad.idUnidad,
        idEjecucion: execProduccionId,
        idTipoEvento: ctx.idTipoCosecha,
        idUsuario: idUsuarioSupervisor,
        fechaEvento: fechaCosecha,
        descripcion: 'Corte y recolección del lote (seed)',
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
    fecha: fechaCosecha,
    comentario: 'Cosecha completada (seed)',
  });
  if (!execCalidadId) return;

  const esRechazado = etapa === 'CALIDAD_RECHAZADO';
  const resultado = esRechazado
    ? ResultadoControl.RECHAZADO
    : indice % 3 === 0
      ? ResultadoControl.OBSERVADO
      : ResultadoControl.APROBADO;
  const pesoMuestraKg = new Prisma.Decimal(20);
  const pesoRechazadoKg = new Prisma.Decimal(esRechazado ? 6 : indice % 3 === 0 ? 2 : 0.4);
  const porcentajeRechazo = pesoRechazadoKg.div(pesoMuestraKg).mul(100);
  await tx.controlCalidad.create({
    data: {
      idEjecucion: execCalidadId,
      idLote: lote.idLote,
      idUsuario: idUsuarioCalidad,
      idCategoriaCalidad: elegir(ctx.categorias, indice).idCategoriaCalidad,
      calibreMm: new Prisma.Decimal(36 + (indice % 8)),
      pesoMuestraKg,
      porcentajeRechazo,
      resultado,
      observaciones: esRechazado ? 'Lote rechazado en inspección (seed)' : null,
    },
  });

  if (esRechazado || etapa === 'CALIDAD') return;

  const execEmpaqueId = await avanzarLote(tx, {
    idLote: lote.idLote,
    idInstancia,
    idFlujo: ctx.idFlujoPrincipal,
    faseActual: { execId: execCalidadId, info: ctx.fasesPrincipales.CALIDAD },
    siguienteFase: ctx.fasesPrincipales.EMPAQUE,
    idUsuario: idUsuarioCalidad,
    fecha: fechaCosecha,
    comentario: 'Control de calidad aprobado (seed)',
  });
  if (!execEmpaqueId) return;

  const numEmpaques = 1 + (indice % 3);
  const empaques: Array<{
    idEmpaque: bigint;
    idUnidad: bigint;
    idInstancia: bigint;
    idEjecucion: bigint;
  }> = [];
  for (let e = 0; e < numEmpaques; e++) {
    const unidadEmpaque = await tx.unidadTrazable.create({
      data: { tipo: TipoUnidadTrazable.EMPAQUE },
      select: { idUnidad: true, codigo: true },
    });
    const empaque = await tx.empaque.create({
      data: {
        idUnidad: unidadEmpaque.idUnidad,
        idEjecucion: execEmpaqueId,
        idLote: lote.idLote,
        idCategoriaCalidad: elegir(ctx.categorias, indice + e).idCategoriaCalidad,
        codigoCaja: unidadEmpaque.codigo,
        pesoNetoKg: new Prisma.Decimal(18 + (e % 3)),
        codigoQr: `QR-${unidadEmpaque.codigo}`,
        estado: EstadoEmpaque.DISPONIBLE,
      },
      select: { idEmpaque: true, idUnidad: true },
    });
    const { idInstancia: idInstanciaEmpaque, idEjecucion: idEjecucionEmpaque } =
      await abrirFlujoUnidad(tx, {
        idUnidad: unidadEmpaque.idUnidad,
        idFlujo: ctx.idFlujoEmpaque,
        codigoInstancia: `FLW-${unidadEmpaque.codigo}`,
        primeraFase: ctx.fasesEmpaque[0],
        fecha: fechaCosecha,
      });
    empaques.push({
      idEmpaque: empaque.idEmpaque,
      idUnidad: empaque.idUnidad,
      idInstancia: idInstanciaEmpaque,
      idEjecucion: idEjecucionEmpaque,
    });
  }

  const execLogisticaId = await avanzarLote(tx, {
    idLote: lote.idLote,
    idInstancia,
    idFlujo: ctx.idFlujoPrincipal,
    faseActual: { execId: execEmpaqueId, info: ctx.fasesPrincipales.EMPAQUE },
    siguienteFase: ctx.fasesPrincipales.LOGISTICA,
    idUsuario: idUsuarioCalidad,
    fecha: fechaCosecha,
    comentario: 'Empaque completado (seed)',
  });

  if (etapa === 'EMPACADO' || !execLogisticaId) return;

  const objetivoNaviera = elegir(ctx.navieras, indice);
  const puertoOrigen = elegir(ctx.puertos, indice);
  const puertoDestino = elegir(ctx.puertos, indice + 1);
  const unidadEnvio = await tx.unidadTrazable.create({
    data: { tipo: TipoUnidadTrazable.ENVIO },
    select: { idUnidad: true, codigo: true },
  });
  const envio = await tx.envio.create({
    data: {
      idUnidad: unidadEnvio.idUnidad,
      idEjecucion: execLogisticaId,
      idNaviera: objetivoNaviera.idNaviera,
      idPuertoOrigen: puertoOrigen.idPuerto,
      idPuertoDestino: puertoDestino.idPuerto,
      codigoEnvio: unidadEnvio.codigo,
      numeroContenedor: `CONT-${String(indice).padStart(5, '0')}`,
      fechaSalida: fechaCosecha,
      temperaturaSalida: new Prisma.Decimal(13.5),
      estado: EstadoEnvio.PLANIFICADO,
    },
    select: { idEnvio: true },
  });
  const { idInstancia: idInstanciaEnvio, idEjecucion: execEnvioId } = await abrirFlujoUnidad(tx, {
    idUnidad: unidadEnvio.idUnidad,
    idFlujo: ctx.idFlujoEnvio,
    codigoInstancia: `FLW-${unidadEnvio.codigo}`,
    primeraFase: ctx.fasesEnvio[0],
    fecha: fechaCosecha,
  });
  await tx.envioEmpaque.createMany({
    data: empaques.map((empaque) => ({ idEnvio: envio.idEnvio, idEmpaque: empaque.idEmpaque })),
  });

  // Avanza el envío y sus cajas juntos: DISPONIBLE→ASIGNADO (paso 1), →EN_TRANSITO (paso 2),
  // y opcionalmente →ENTREGADO (paso 3, solo para lotes que llegan a CERRADO).
  const pasosDestino = etapa === 'CERRADO' ? 3 : 2;
  let execEnvioActualId = execEnvioId;
  const execEmpaquesActuales = new Map<bigint, bigint>(
    empaques.map((empaque) => [empaque.idUnidad, empaque.idEjecucion]),
  );

  for (let paso = 1; paso <= pasosDestino; paso++) {
    const resultadoEnvio = await avanzarUnidadFlujo(tx, {
      idInstancia: idInstanciaEnvio,
      idFlujo: ctx.idFlujoEnvio,
      faseActualExecId: execEnvioActualId,
      siguienteFase: ctx.fasesEnvio[paso],
      esTerminal: paso === ctx.fasesEnvio.length - 1,
      idUsuario: idUsuarioLogistica,
      fecha: fechaCosecha,
    });
    execEnvioActualId = resultadoEnvio.nuevaEjecucionId;

    for (const empaque of empaques) {
      const execActual = execEmpaquesActuales.get(empaque.idUnidad)!;
      const resultadoEmpaque = await avanzarUnidadFlujo(tx, {
        idInstancia: empaque.idInstancia,
        idFlujo: ctx.idFlujoEmpaque,
        faseActualExecId: execActual,
        siguienteFase: ctx.fasesEmpaque[paso],
        esTerminal: paso === ctx.fasesEmpaque.length - 1,
        idUsuario: idUsuarioLogistica,
        fecha: fechaCosecha,
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

  await avanzarLote(tx, {
    idLote: lote.idLote,
    idInstancia,
    idFlujo: ctx.idFlujoPrincipal,
    faseActual: { execId: execLogisticaId, info: ctx.fasesPrincipales.LOGISTICA },
    siguienteFase: null,
    idUsuario: idUsuarioLogistica,
    fecha: fechaCosecha,
    comentario: 'Exportación completada (seed)',
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
  const yaSembrados = await prisma.loteProduccion.count();
  if (yaSembrados >= OBJETIVO_LOTES) {
    console.log('✅ Lotes de volumen ya sembrados, se omite.');
    return;
  }

  const [flujoPrincipal, flujoEmpaque, flujoEnvio, variedades, categorias, navieras, puertos, tiposEvento] =
    await Promise.all([
      prisma.flujo.findFirstOrThrow({
        where: { codigo: 'TRAZABILIDAD_BANANO_EXPORT', activo: true },
        orderBy: { version: 'desc' },
        include: { fases: { where: { activo: true }, orderBy: { orden: 'asc' } } },
      }),
      prisma.flujo.findFirstOrThrow({
        where: { codigo: 'EMPAQUE_FLUJO', activo: true },
        orderBy: { version: 'desc' },
        include: { fases: { where: { activo: true }, orderBy: { orden: 'asc' } } },
      }),
      prisma.flujo.findFirstOrThrow({
        where: { codigo: 'ENVIO_FLUJO', activo: true },
        orderBy: { version: 'desc' },
        include: { fases: { where: { activo: true }, orderBy: { orden: 'asc' } } },
      }),
      prisma.variedad.findMany({ where: { activo: true }, select: { idVariedad: true } }),
      prisma.categoriaCalidad.findMany({ where: { activo: true }, select: { idCategoriaCalidad: true } }),
      prisma.naviera.findMany({ where: { activo: true }, select: { idNaviera: true } }),
      prisma.puerto.findMany({ where: { activo: true }, select: { idPuerto: true } }),
      prisma.tipoEvento.findMany({ where: { nombre: { in: ['SIEMBRA', 'COSECHA'] } } }),
    ]);

  const fasesPrincipalesPorCodigo = new Map(flujoPrincipal.fases.map((f) => [f.codigo, f]));
  const ctx: FlujoContext = {
    idFlujoPrincipal: flujoPrincipal.idFlujo,
    fasesPrincipales: {
      PRODUCCION: fasesPrincipalesPorCodigo.get('PRODUCCION')!,
      CALIDAD: fasesPrincipalesPorCodigo.get('CALIDAD')!,
      EMPAQUE: fasesPrincipalesPorCodigo.get('EMPAQUE')!,
      LOGISTICA: fasesPrincipalesPorCodigo.get('LOGISTICA')!,
    },
    idFlujoEmpaque: flujoEmpaque.idFlujo,
    fasesEmpaque: flujoEmpaque.fases,
    idFlujoEnvio: flujoEnvio.idFlujo,
    fasesEnvio: flujoEnvio.fases,
    variedades,
    categorias,
    navieras,
    puertos,
    idTipoSiembra: tiposEvento.find((t) => t.nombre === 'SIEMBRA')?.idTipoEvento ?? null,
    idTipoCosecha: tiposEvento.find((t) => t.nombre === 'COSECHA')?.idTipoEvento ?? null,
    usuarios,
  };

  const fincaPool = productores.flatMap((p) => p.fincas);
  if (fincaPool.length === 0) {
    console.log('⚠️  No hay fincas de volumen disponibles; se omite la siembra de lotes.');
    return;
  }

  const secuenciaEtapas: Etapa[] = DISTRIBUCION.flatMap(({ etapa, cantidad }) =>
    Array.from({ length: cantidad }, () => etapa),
  );

  let sembrados = 0;
  for (let i = 0; i < secuenciaEtapas.length; i++) {
    const idFinca = elegir(fincaPool, i).idFinca;
    const etapa = secuenciaEtapas[i];
    await prisma.$transaction(
      async (tx) => {
        await crearLoteVolumen(tx, ctx, { idFinca, etapa, indice: i });
      },
      { timeout: 30000 },
    );
    sembrados++;
    if (sembrados % 50 === 0) {
      console.log(`   … ${sembrados}/${secuenciaEtapas.length} lotes de volumen sembrados`);
    }
  }

  console.log(`✅ ${sembrados} lotes de volumen sembrados con flujos y bloques encadenados.`);
}
