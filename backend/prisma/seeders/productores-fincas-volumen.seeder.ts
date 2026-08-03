import { PrismaClient } from '@prisma/client';
import {
  crearPRNG,
  elegir,
  randomEntre,
  normal,
  redondear,
  enteroEntre,
} from './helpers/bi-data';

const OBJETIVO_PRODUCTORES = 60;

/** Nombre de razón social construido desde partes realistas (español neutro). */
const PREFIJOS = [
  'Bananera',
  'Agroexportadora',
  'Hacienda',
  'Finca',
  'Exportadora',
  'Agrícola',
  'Plantaciones',
  'Productora',
  'Agroindustrial',
  'Frutas',
];

const SUSTANTIVOS = [
  'del Pacífico',
  'El Oro',
  'San José',
  'La Esperanza',
  'Los Ríos',
  'El Guabo',
  'Santa María',
  'Machala',
  'Tropical',
  'del Golfo',
  'La Concordia',
  'Valle Verde',
  'El Paraíso',
  'Las Delicias',
  'San Juan',
  'Doña Ana',
  'La Carolina',
  'Santa Rosa',
  'Río Guayas',
  'Las Mercedes',
  'El Arenal',
  'Villa Bonita',
  'La Aurora',
  'Santa Isabel',
];

const TIPOS_SOCIALES = ['S.A.', 'Cía. Ltda.', 'S.A.S.', ''] as const;

interface Provincia {
  region: string;
  localidades: string[];
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  peso: number;
}

const PROVINCIAS: Provincia[] = [
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
];

function provinciaAleatoria(rng: () => number): Provincia {
  const total = PROVINCIAS.reduce((suma, p) => suma + p.peso, 0);
  let restante = rng() * total;
  for (const provincia of PROVINCIAS) {
    restante -= provincia.peso;
    if (restante <= 0) return provincia;
  }
  return PROVINCIAS[PROVINCIAS.length - 1];
}

function nombreRazonSocial(rng: () => number): string {
  const prefijo = elegir(rng, PREFIJOS);
  const sustantivo = elegir(rng, SUSTANTIVOS);
  const tipo = elegir(rng, [...TIPOS_SOCIALES]);
  return `${prefijo} ${sustantivo} ${tipo}`.replace(/\s+/g, ' ').trim();
}

export interface FincaVolumen {
  idFinca: bigint;
  areaHectareas: number;
  nombre: string;
}

export interface ProductorVolumen {
  idProductor: bigint;
  fincas: FincaVolumen[];
}

export async function seedProductoresFincasVolumen(
  prisma: PrismaClient,
): Promise<ProductorVolumen[]> {
  const existentes = await prisma.productor.count({
    where: { identificacion: { startsWith: '09VOL' } },
  });
  if (existentes >= OBJETIVO_PRODUCTORES) {
    console.log('✅ Productores/fincas de volumen ya sembrados, se omite.');
    const productoresBD = await prisma.productor.findMany({
      where: { identificacion: { startsWith: '09VOL' } },
      select: {
        idProductor: true,
        fincas: { select: { idFinca: true, areaHectareas: true, nombre: true } },
      },
      orderBy: { identificacion: 'asc' },
    });
    return productoresBD.map(p => ({
      idProductor: p.idProductor,
      fincas: p.fincas.map(f => ({
        idFinca: f.idFinca,
        nombre: f.nombre,
        areaHectareas: f.areaHectareas ? Number(f.areaHectareas) : 0,
      }))
    }));
  }

  const result: ProductorVolumen[] = [];
  for (let i = 0; i < OBJETIVO_PRODUCTORES; i++) {
    const rng = crearPRNG(500 + i * 977);
    const identificacion = `09VOL${String(10000000 + i).padStart(8, '0')}`;
    const razonSocial = nombreRazonSocial(rng);
    const provincia = provinciaAleatoria(rng);
    const localidad = elegir(rng, provincia.localidades);

    const productor = await prisma.productor.upsert({
      where: { identificacion },
      update: {
        nombreRazonSocial: razonSocial,
        telefono: `09${String(80000000 + i * 7).padStart(8, '0')}`,
        correo: `productor.vol.${i}@bananotrace.test`,
        direccion: `Km ${enteroEntre(rng, 1, 40)} vía a ${localidad}, provincia de ${provincia.region}`,
      },
      create: {
        identificacion,
        nombreRazonSocial: razonSocial,
        telefono: `09${String(80000000 + i * 7).padStart(8, '0')}`,
        correo: `productor.vol.${i}@bananotrace.test`,
        direccion: `Km ${enteroEntre(rng, 1, 40)} vía a ${localidad}, provincia de ${provincia.region}`,
      },
      select: { idProductor: true },
    });

    const resultado = rng();
    const numFincas = resultado < 0.55 ? 1 : resultado < 0.9 ? 2 : 3;
    const fincas: FincaVolumen[] = [];

    for (let f = 0; f < numFincas; f++) {
      const rngFinca = crearPRNG(700 + i * 977 + f * 31);
      const prov = provinciaAleatoria(rngFinca);
      const loc = elegir(rngFinca, prov.localidades);
      const latitud = redondear(
        prov.latMin + rngFinca() * (prov.latMax - prov.latMin),
        6,
      );
      const longitud = redondear(
        prov.lonMin + rngFinca() * (prov.lonMax - prov.lonMin),
        6,
      );
      // Área lognormal-ish 5-60 ha con cola hacia arriba.
      let areaHectareas = redondear(
        Math.min(60, Math.max(5, Math.exp(normal(rngFinca, Math.log(16), 0.65)))),
        2,
      );
      // 2-3 fincas grandes outlier (80-150 ha).
      if (rngFinca() < 0.032) {
        areaHectareas = redondear(randomEntre(rngFinca, 80, 150), 2);
      }

      const nombre =
        f === 0
          ? `Finca ${razonSocial}`
          : `Finca ${razonSocial} ${f + 1}`;

      const finca = await prisma.finca.upsert({
        where: {
          codigoFinca: `09VOL_${productor.idProductor}_${f}`,
        },
        update: {
          pais: 'Ecuador',
          region: prov.region,
          localidad: loc,
          sublocalidad: loc,
          latitud,
          longitud,
          areaHectareas,
          estado: true,
        },
        create: {
          idProductor: productor.idProductor,
          nombre,
          pais: 'Ecuador',
          region: prov.region,
          localidad: loc,
          sublocalidad: loc,
          latitud,
          longitud,
          areaHectareas,
          estado: true,
        },
        select: { idFinca: true },
      });

      fincas.push({ idFinca: finca.idFinca, areaHectareas, nombre });
    }

    result.push({ idProductor: productor.idProductor, fincas });
  }

  console.log(
    `✅ Volumen sembrado: ${OBJETIVO_PRODUCTORES} productores y ${result.reduce(
      (suma, p) => suma + p.fincas.length,
      0,
    )} fincas.`,
  );
  return result;
}
