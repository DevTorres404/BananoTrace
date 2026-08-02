import { EstadoLote, PrismaClient, TipoUnidadTrazable } from '@prisma/client';

export async function seedFincas(prisma: PrismaClient, idProductor: bigint) {
  const finca = await prisma.finca.upsert({
    where: { codigoFinca: 'FINCA-DEMO-001' },
    update: {
      idProductor,
      nombre: 'Finca BananoTrace',
      pais: 'Ecuador',
      region: 'Santa Elena',
      localidad: 'Santa Elena',
      sublocalidad: 'Chanduy',
      latitud: -2.34081,
      longitud: -80.70264,
      areaHectareas: 24.5,
      estado: true,
    },
    create: {
      idProductor,
      codigoFinca: 'FINCA-DEMO-001',
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

  const unidad = await prisma.unidadTrazable.upsert({
    where: {
      tipo_codigo: {
        tipo: TipoUnidadTrazable.LOTE,
        codigo: 'LOTE-DEMO-001',
      },
    },
    update: {},
    create: {
      tipo: TipoUnidadTrazable.LOTE,
      codigo: 'LOTE-DEMO-001',
    },
  });

  await prisma.loteProduccion.upsert({
    where: { codigoLote: 'LOTE-DEMO-001' },
    update: {
      idFinca: finca.idFinca,
      idUnidad: unidad.idUnidad,
      variedad: 'Cavendish',
      estado: EstadoLote.EN_PRODUCCION,
      cantidadPlantas: 1850,
    },
    create: {
      idFinca: finca.idFinca,
      idUnidad: unidad.idUnidad,
      codigoLote: 'LOTE-DEMO-001',
      variedad: 'Cavendish',
      estado: EstadoLote.EN_PRODUCCION,
      cantidadPlantas: 1850,
      fechaSiembra: new Date('2026-01-15T00:00:00.000Z'),
      fechaEstimadaCosecha: new Date('2026-10-15T00:00:00.000Z'),
    },
  });

  await prisma.certificacion.upsert({
    where: { numeroCertificado: 'PHYTO-BT-2026-001' },
    update: {
      idFinca: finca.idFinca,
      tipoCertificacion: 'Certificado fitosanitario',
      entidadEmisora: 'Agrocalidad Ecuador',
      fechaEmision: new Date('2026-01-10T00:00:00.000Z'),
      fechaVencimiento: new Date('2027-01-10T00:00:00.000Z'),
      documentoUrl: 'https://www.agrocalidad.gob.ec/',
    },
    create: {
      idFinca: finca.idFinca,
      tipoCertificacion: 'Certificado fitosanitario',
      entidadEmisora: 'Agrocalidad Ecuador',
      numeroCertificado: 'PHYTO-BT-2026-001',
      fechaEmision: new Date('2026-01-10T00:00:00.000Z'),
      fechaVencimiento: new Date('2027-01-10T00:00:00.000Z'),
      documentoUrl: 'https://www.agrocalidad.gob.ec/',
    },
  });

  console.log('✅ Finca, lote activo y certificación de demostración creados.');
  return finca;
}
