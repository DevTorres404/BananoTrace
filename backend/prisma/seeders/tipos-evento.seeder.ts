import { PrismaClient } from '@prisma/client';

export async function seedTiposEvento(prisma: PrismaClient) {
  const tipos = [
    { idTipoEvento: 1, nombre: 'SIEMBRA', descripcion: 'Registro de siembra del cultivo en el lote' },
    { idTipoEvento: 2, nombre: 'RIEGO', descripcion: 'Actividad de riego del cultivo' },
    { idTipoEvento: 3, nombre: 'FERTILIZACION', descripcion: 'Aplicación de fertilizantes al cultivo' },
    { idTipoEvento: 4, nombre: 'FUMIGACION', descripcion: 'Control fitosanitario y aplicación de agroquímicos' },
    { idTipoEvento: 5, nombre: 'INSPECCION_CAMPO', descripcion: 'Inspección visual del estado del cultivo en campo' },
    { idTipoEvento: 6, nombre: 'COSECHA', descripcion: 'Corte y recolección de racimos del lote' },
    { idTipoEvento: 7, nombre: 'RECEPCION', descripcion: 'Recepción del producto en la empacadora' },
    { idTipoEvento: 8, nombre: 'EMPACADO', descripcion: 'Lavado, selección, clasificación y empaque del producto' },
    { idTipoEvento: 9, nombre: 'CONTROL_CALIDAD', descripcion: 'Inspección de calidad e inocuidad del lote' },
    { idTipoEvento: 10, nombre: 'TRANSPORTE', descripcion: 'Traslado del producto entre puntos de la cadena' },
    { idTipoEvento: 11, nombre: 'EXPORTACION', descripcion: 'Consolidación de documentos y embarque para exportación' },
  ];

  for (const tipo of tipos) {
    await prisma.tipoEvento.upsert({
      where: { nombre: tipo.nombre },
      update: {},
      create: tipo,
    });
  }
  console.log('✅ Tipos de evento creados.');
}
