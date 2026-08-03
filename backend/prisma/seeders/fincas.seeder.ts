import {
  EstadoFlujo,
  EstadoLote,
  PrismaClient,
  RolUnidadFlujo,
  TipoUnidadTrazable,
} from '@prisma/client';

export async function seedFincas(prisma: PrismaClient, idProductor: bigint) {
  let finca = await prisma.finca.findFirst({
    where: { idProductor, nombre: 'Finca BananoTrace' },
  });
  if (!finca) {
    finca = await prisma.finca.create({
      data: {
        idProductor,
        nombre: 'Finca BananoTrace',
        pais: 'Ecuador',
        region: 'Santa Elena',
        localidad: 'Santa Elena',
        sublocalidad: 'Chanduy',
        latitud: -2.34081,
        longitud: -80.70264,
        areaHectareas: 24.5,
      },
    });
  } else {
    finca = await prisma.finca.update({
      where: { idFinca: finca.idFinca },
      data: {
        idProductor,
        pais: 'Ecuador',
        region: 'Santa Elena',
        localidad: 'Santa Elena',
        sublocalidad: 'Chanduy',
        latitud: -2.34081,
        longitud: -80.70264,
        areaHectareas: 24.5,
        estado: true,
      },
    });
  }
  if (!/^FIN-\d{4}-\d{3,}$/.test(finca.codigoFinca)) {
    await prisma.$executeRaw`UPDATE "fincas" SET "codigo_finca" = '' WHERE "id_finca" = ${finca.idFinca}`;
    finca = (await prisma.finca.findUnique({
      where: { idFinca: finca.idFinca },
    }))!;
  }

  const cavendish = await prisma.variedad.findUniqueOrThrow({
    where: { codigo: 'CAVENDISH' },
  });

  let lot = await prisma.loteProduccion.findFirst({
    where: { idFinca: finca.idFinca, idVariedad: cavendish.idVariedad },
  });
  if (!lot) {
    const unit = await prisma.unidadTrazable.create({
      data: { tipo: TipoUnidadTrazable.LOTE },
    });
    lot = await prisma.loteProduccion.create({
      data: {
        idFinca: finca.idFinca,
        idUnidad: unit.idUnidad,
        idVariedad: cavendish.idVariedad,
        estado: EstadoLote.EN_PRODUCCION,
        cantidadPlantas: 1850,
        fechaSiembra: new Date('2026-01-15T00:00:00.000Z'),
        fechaEstimadaCosecha: new Date('2026-10-15T00:00:00.000Z'),
      },
    });
  }
  if (!/^BAN-\d{4}-\d{3,}$/.test(lot.codigoLote)) {
    await prisma.$executeRaw`UPDATE "unidades_trazables" SET "codigo" = '' WHERE "id_unidad" = ${lot.idUnidad}`;
    await prisma.$executeRaw`UPDATE "lotes_produccion" SET "codigo_lote" = '' WHERE "id_lote" = ${lot.idLote}`;
    lot = (await prisma.loteProduccion.findUnique({
      where: { idLote: lot.idLote },
    }))!;
  }
  await prisma.unidadTrazable.update({
    where: { idUnidad: lot.idUnidad },
    data: { codigo: lot.codigoLote },
  });

  const tipoCert = await prisma.tipoCertificacion.findFirst({
    where: { nombre: 'Certificación fitosanitaria' },
  });
  const entidadCert = await prisma.entidadCertificadora.findFirst({
    where: { nombre: 'Agrocalidad Ecuador' },
  });

  if (tipoCert && entidadCert) {
    await prisma.certificacion.upsert({
      where: { numeroCertificado: 'PHYTO-BT-2026-001' },
      update: {
        idFinca: finca.idFinca,
        idTipoCertificacion: tipoCert.idTipoCertificacion,
        idEntidadCertificadora: entidadCert.idEntidadCertificadora,
        fechaEmision: new Date('2026-01-10T00:00:00.000Z'),
        fechaVencimiento: new Date('2027-01-10T00:00:00.000Z'),
        documentoUrl: 'https://www.agrocalidad.gob.ec/',
      },
      create: {
        idFinca: finca.idFinca,
        idTipoCertificacion: tipoCert.idTipoCertificacion,
        idEntidadCertificadora: entidadCert.idEntidadCertificadora,
        numeroCertificado: 'PHYTO-BT-2026-001',
        fechaEmision: new Date('2026-01-10T00:00:00.000Z'),
        fechaVencimiento: new Date('2027-01-10T00:00:00.000Z'),
        documentoUrl: 'https://www.agrocalidad.gob.ec/',
      },
    });
  }

  const existingLink = await prisma.flujoInstanciaUnidad.findFirst({
    where: { idUnidad: lot.idUnidad, rol: RolUnidadFlujo.PRINCIPAL },
  });
  if (!existingLink) {
    const flow = await prisma.flujo.findFirst({
      where: { codigo: 'TRAZABILIDAD_BANANO_EXPORT', activo: true },
      orderBy: { version: 'desc' },
      include: {
        fases: { where: { activo: true }, orderBy: { orden: 'asc' }, take: 1 },
      },
    });
    const phase = flow?.fases[0];
    const user = await prisma.usuario.findFirst({
      where: { idProductor, rol: { nombre: 'SUPERVISOR_AGRICOLA' }, estado: true },
    });
    if (!flow || !phase || !user) {
      throw new Error(
        'No se pudo inicializar el flujo del lote de demostración.',
      );
    }
    const instance = await prisma.flujoInstancia.create({
      data: {
        idFlujo: flow.idFlujo,
        codigo: `FLW-${lot.codigoLote}`,
        estado: EstadoFlujo.EN_PROCESO,
        fechaInicio: new Date('2026-01-15T00:00:00.000Z'),
        unidades: {
          create: { idUnidad: lot.idUnidad, rol: RolUnidadFlujo.PRINCIPAL },
        },
      },
    });
    const execution = await prisma.faseEjecucion.create({
      data: {
        idInstancia: instance.idInstancia,
        idFase: phase.idFase,
        idFlujo: flow.idFlujo,
        idResponsable: user.idUsuario,
        estado: EstadoFlujo.EN_PROCESO,
        fechaInicio: new Date('2026-01-15T00:00:00.000Z'),
      },
    });
    await prisma.transicionEjecucion.create({
      data: {
        idEjecucion: execution.idEjecucion,
        idUsuario: user.idUsuario,
        estadoAnterior: null,
        estadoNuevo: EstadoFlujo.EN_PROCESO,
        comentario: 'Inicio automático del flujo de demostración',
      },
    });
    const eventTypes = await prisma.tipoEvento.findMany();
    const typeMap = Object.fromEntries(eventTypes.map(t => [t.nombre, t.idTipoEvento]));
    
    const eventsToCreate = [
      { type: 'SIEMBRA', offsetDays: 0, desc: 'Registro inicial de siembra del lote de demostración' },
      { type: 'FERTILIZACION', offsetDays: 30, desc: 'Aplicación de fertilizante orgánico rico en potasio' },
      { type: 'INSPECCION_CAMPO', offsetDays: 60, desc: 'Control de malezas y estado foliar' },
      { type: 'COSECHA', offsetDays: 270, desc: 'Corte de racimos con cinta azul' },
      { type: 'RECEPCION', offsetDays: 271, desc: 'Ingreso a patio de la empacadora' },
      { type: 'CONTROL_CALIDAD', offsetDays: 271, desc: 'Inspección de grado, largo y daños mecánicos' }
    ];

    const baseDate = new Date('2026-01-15T00:00:00.000Z');
    
    for (const evt of eventsToCreate) {
      if (typeMap[evt.type]) {
        const evtDate = new Date(baseDate);
        evtDate.setDate(evtDate.getDate() + evt.offsetDays);
        await prisma.eventoTrazabilidad.create({
          data: {
            idUnidad: lot.idUnidad,
            idEjecucion: execution.idEjecucion,
            idTipoEvento: typeMap[evt.type],
            idUsuario: user.idUsuario,
            fechaEvento: evtDate,
            descripcion: evt.desc,
          }
        });
      }
    }
  }

  console.log(
    '✅ Finca, lote con flujo y certificación de demostración creados.',
  );
  return finca;
}
