import { PrismaClient } from '@prisma/client';

const categoriasCalidad = [
  {
    codigo: 'EXTRA_PREMIUM',
    nombre: 'Extra / Premium',
    descripcion: 'Fruta de exportación de máxima selección',
  },
  {
    codigo: 'PRIMERA',
    nombre: 'Primera',
    descripcion: 'Fruta que cumple los criterios comerciales principales',
  },
  {
    codigo: 'SEGUNDA',
    nombre: 'Segunda',
    descripcion: 'Fruta apta con tolerancias comerciales adicionales',
  },
  {
    codigo: 'INDUSTRIAL',
    nombre: 'Industrial',
    descripcion: 'Fruta destinada a transformación o procesamiento',
  },
];

const tiposCertificacion = [
  { codigo: 'FITOSANITARIA', nombre: 'Certificación fitosanitaria' },
  { codigo: 'GLOBALGAP', nombre: 'GLOBALG.A.P.' },
  { codigo: 'ORGANICA', nombre: 'Certificación orgánica' },
  { codigo: 'GRASP', nombre: 'GRASP' },
  { codigo: 'COMERCIO_JUSTO', nombre: 'Comercio justo' },
  { codigo: 'RAINFOREST_ALLIANCE', nombre: 'Rainforest Alliance' },
];

const entidadesCertificadoras = [
  { codigo: 'AGROCALIDAD_EC', nombre: 'Agrocalidad', alcance: 'Ecuador' },
  { codigo: 'GLOBALGAP', nombre: 'GLOBALG.A.P.', alcance: 'Internacional' },
  {
    codigo: 'USDA',
    nombre: 'United States Department of Agriculture',
    alcance: 'Estados Unidos',
  },
  {
    codigo: 'UNION_EUROPEA',
    nombre: 'Unión Europea',
    alcance: 'Unión Europea',
  },
  {
    codigo: 'RAINFOREST_ALLIANCE',
    nombre: 'Rainforest Alliance',
    alcance: 'Internacional',
  },
  {
    codigo: 'FAIRTRADE',
    nombre: 'Fairtrade International',
    alcance: 'Internacional',
  },
];

const tiposDocumento = [
  { codigo: 'CERTIFICADO', nombre: 'Certificado' },
  { codigo: 'INFORME_LABORATORIO', nombre: 'Informe de laboratorio' },
  { codigo: 'ACTA_INSPECCION', nombre: 'Acta de inspección' },
  { codigo: 'FACTURA', nombre: 'Factura' },
  { codigo: 'GUIA_REMISION', nombre: 'Guía de remisión' },
  { codigo: 'CONOCIMIENTO_EMBARQUE', nombre: 'Conocimiento de embarque' },
  { codigo: 'OTRO', nombre: 'Otro documento' },
];

const navieras = [
  { codigo: 'MSC', nombre: 'Mediterranean Shipping Company' },
  { codigo: 'MAERSK', nombre: 'Maersk' },
  { codigo: 'CMA_CGM', nombre: 'CMA CGM' },
  { codigo: 'HAPAG_LLOYD', nombre: 'Hapag-Lloyd' },
  { codigo: 'COSCO', nombre: 'COSCO Shipping' },
  { codigo: 'ONE', nombre: 'Ocean Network Express' },
];

const puertos = [
  {
    codigo: 'ECGYE',
    nombre: 'Guayaquil',
    paisCodigo: 'EC',
    paisNombre: 'Ecuador',
  },
  {
    codigo: 'ECPBO',
    nombre: 'Puerto Bolívar',
    paisCodigo: 'EC',
    paisNombre: 'Ecuador',
  },
  {
    codigo: 'NLRTM',
    nombre: 'Rotterdam',
    paisCodigo: 'NL',
    paisNombre: 'Países Bajos',
  },
  {
    codigo: 'BEANR',
    nombre: 'Amberes',
    paisCodigo: 'BE',
    paisNombre: 'Bélgica',
  },
  {
    codigo: 'DEHAM',
    nombre: 'Hamburgo',
    paisCodigo: 'DE',
    paisNombre: 'Alemania',
  },
  {
    codigo: 'USLAX',
    nombre: 'Los Ángeles',
    paisCodigo: 'US',
    paisNombre: 'Estados Unidos',
  },
  {
    codigo: 'CNSHA',
    nombre: 'Shanghái',
    paisCodigo: 'CN',
    paisNombre: 'China',
  },
];

export async function seedCatalogosDominio(prisma: PrismaClient) {
  for (const item of categoriasCalidad) {
    await prisma.categoriaCalidad.upsert({
      where: { codigo: item.codigo },
      update: { ...item, activo: true },
      create: item,
    });
  }
  for (const item of tiposCertificacion) {
    await prisma.tipoCertificacion.upsert({
      where: { codigo: item.codigo },
      update: { ...item, activo: true },
      create: item,
    });
  }
  for (const item of entidadesCertificadoras) {
    await prisma.entidadCertificadora.upsert({
      where: { codigo: item.codigo },
      update: { ...item, activo: true },
      create: item,
    });
  }
  for (const item of tiposDocumento) {
    await prisma.tipoDocumento.upsert({
      where: { codigo: item.codigo },
      update: { ...item, activo: true },
      create: item,
    });
  }
  for (const item of navieras) {
    await prisma.naviera.upsert({
      where: { codigo: item.codigo },
      update: { ...item, activo: true },
      create: item,
    });
  }
  for (const item of puertos) {
    await prisma.puerto.upsert({
      where: { codigo: item.codigo },
      update: { ...item, activo: true },
      create: item,
    });
  }

  console.log(
    '✅ Catálogos de calidad, certificación, documentos y logística creados.',
  );
}
