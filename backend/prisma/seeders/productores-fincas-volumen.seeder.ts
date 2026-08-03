import { PrismaClient } from '@prisma/client';

const OBJETIVO_PRODUCTORES = 60;

const NOMBRES_BASE = [
  'Bananera del Pacífico',
  'Agroexportadora El Oro',
  'Fincas Unidas',
  'Productora Los Ríos',
  'Hacienda Verde',
  'Exportadora Guayas',
  'Agrícola Santa Elena',
  'Bananera San José',
  'Frutas del Golfo',
  'Agroindustrial Machala',
  'Plantaciones Tropicales',
  'Bananera Central',
];

const UBICACIONES = [
  { region: 'El Oro', localidad: 'Machala' },
  { region: 'El Oro', localidad: 'Pasaje' },
  { region: 'El Oro', localidad: 'Santa Rosa' },
  { region: 'Los Ríos', localidad: 'Babahoyo' },
  { region: 'Los Ríos', localidad: 'Quevedo' },
  { region: 'Guayas', localidad: 'Naranjal' },
  { region: 'Guayas', localidad: 'Milagro' },
  { region: 'Santa Elena', localidad: 'La Libertad' },
];

export interface ProductorVolumen {
  idProductor: bigint;
  fincas: Array<{ idFinca: bigint }>;
}

export async function seedProductoresFincasVolumen(
  prisma: PrismaClient,
): Promise<ProductorVolumen[]> {
  const existentes = await prisma.productor.count({
    where: { identificacion: { startsWith: '09VOL' } },
  });
  if (existentes >= OBJETIVO_PRODUCTORES) {
    console.log('✅ Productores/fincas de volumen ya sembrados, se omite.');
    const productores = await prisma.productor.findMany({
      where: { identificacion: { startsWith: '09VOL' } },
      select: { idProductor: true, fincas: { select: { idFinca: true } } },
    });
    return productores;
  }

  const result: ProductorVolumen[] = [];
  for (let i = 0; i < OBJETIVO_PRODUCTORES; i++) {
    const identificacion = `09VOL${String(i).padStart(8, '0')}`;
    const nombreBase = NOMBRES_BASE[i % NOMBRES_BASE.length];
    const nombreRazonSocial = `${nombreBase} ${Math.floor(i / NOMBRES_BASE.length) + 1}`;

    const productor = await prisma.productor.upsert({
      where: { identificacion },
      update: { nombreRazonSocial },
      create: {
        identificacion,
        nombreRazonSocial,
        telefono: `09${String(80000000 + i).padStart(8, '0')}`,
        correo: `productor.vol.${i}@bananotrace.test`,
        direccion: `Km ${1 + (i % 20)} vía a ${UBICACIONES[i % UBICACIONES.length].localidad}`,
      },
      select: { idProductor: true },
    });

    const numFincas = 1 + (i % 2);
    const fincas: Array<{ idFinca: bigint }> = [];
    for (let f = 0; f < numFincas; f++) {
      const ubicacion = UBICACIONES[(i + f) % UBICACIONES.length];
      const finca = await prisma.finca.create({
        data: {
          idProductor: productor.idProductor,
          nombre: `Finca ${nombreRazonSocial} ${f + 1}`,
          pais: 'Ecuador',
          region: ubicacion.region,
          localidad: ubicacion.localidad,
          latitud: -1.5 - ((i + f) % 30) * 0.05,
          longitud: -79.5 - ((i + f) % 30) * 0.04,
          areaHectareas: 8 + ((i + f) % 40),
        },
        select: { idFinca: true },
      });
      fincas.push(finca);
    }

    result.push({ idProductor: productor.idProductor, fincas });
  }

  console.log(
    `✅ ${OBJETIVO_PRODUCTORES} productores de volumen con sus fincas creados.`,
  );
  return result;
}
