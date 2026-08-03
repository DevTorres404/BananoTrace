import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_IDS } from '../../src/auth/domain/role.constants';
import {
  crearPRNG,
  elegir,
  elegirAnio,
  fechaEnVentana,
} from './helpers/bi-data';
import type { ProductorVolumen } from './productores-fincas-volumen.seeder';

const CONTEOS = {
  SUPERVISOR_AGRICOLA: 12,
  GERENTE_PRODUCTOR: 8,
  CALIDAD: 10,
  LOGISTICA: 6,
  CLIENTE: 4,
} as const;

const CLAVE_RESULTADO: Record<keyof typeof CONTEOS, keyof UsuariosVolumen> = {
  SUPERVISOR_AGRICOLA: 'supervisores',
  GERENTE_PRODUCTOR: 'gerentes',
  CALIDAD: 'calidad',
  LOGISTICA: 'logistica',
  CLIENTE: 'clientes',
};

export interface UsuariosVolumen {
  supervisores: bigint[];
  gerentes: bigint[];
  calidad: bigint[];
  logistica: bigint[];
  clientes: bigint[];
}

const NOMBRES = [
  'María',
  'Carlos',
  'Ana',
  'Luis',
  'Sofía',
  'Diego',
  'Valentina',
  'Andrés',
  'Camila',
  'Jorge',
  'Paola',
  'Fernando',
  'Lucía',
  'Mateo',
  'Daniela',
  'Sebastián',
  'Gabriela',
  'René',
  'Karla',
  'Mauricio',
  'Ximena',
  'Ramiro',
  'Estefanía',
  'Cristian',
  'Verónica',
  'Patricio',
];

const APELLIDOS = [
  'Rodríguez',
  'Vásquez',
  'Cevallos',
  'Mendoza',
  'Zambrano',
  'Alvarado',
  'Chávez',
  'Salazar',
  'Peñafiel',
  'Loor',
  'Intriago',
  'Moreira',
  'Vera',
  'Pincay',
  'Suárez',
  'Mora',
  'González',
  'Noboa',
  'Paredes',
  'Cedeño',
  'Avilés',
  'Santana',
];

function nombreCompleto(
  rng: () => number,
): { nombres: string; apellidos: string } {
  const nombre1 = elegir(rng, NOMBRES);
  const apellido1 = elegir(rng, APELLIDOS);
  let nombres = nombre1;
  if (rng() < 0.45) {
    nombres = `${nombre1} ${elegir(rng, NOMBRES)}`;
  }
  let apellidos = apellido1;
  if (rng() < 0.55) {
    apellidos = `${apellido1} ${elegir(rng, APELLIDOS)}`;
  }
  return { nombres, apellidos };
}

export async function seedUsuariosVolumen(
  prisma: PrismaClient,
  productores: ProductorVolumen[],
): Promise<UsuariosVolumen> {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const passwordHash = await bcrypt.hash('demo12345', saltRounds);

  const result: UsuariosVolumen = {
    supervisores: [],
    gerentes: [],
    calidad: [],
    logistica: [],
    clientes: [],
  };

  let semillaGlobal = 0;
  const crearGrupo = async (
    rolNombre: keyof typeof CONTEOS,
    idRol: number,
    vincularProductor: boolean,
  ) => {
    const cantidad = CONTEOS[rolNombre];
    const ids: bigint[] = [];
    for (let j = 0; j < cantidad; j++) {
      const rng = crearPRNG(900 + semillaGlobal * 131);
      semillaGlobal += 1;
      const { nombres, apellidos } = nombreCompleto(rng);
      const idProductor = vincularProductor
        ? productores[(semillaGlobal + j) % productores.length].idProductor
        : null;
      const identificacion = `VOLUSR-${rolNombre}-${j}`;

      // Fecha de creación repartida entre 2024 y 2026 (no uniforme).
      const anio = elegirAnio(rng, { 2024: 0.35, 2025: 0.35, 2026: 0.3 });
      const fechaCreacion =
        anio >= 2026
          ? fechaEnVentana(
              rng,
              new Date(Date.UTC(2026, 0, 1)),
              new Date(),
              { conHora: false },
            )
          : fechaEnVentana(
              rng,
              new Date(Date.UTC(anio, 0, 1)),
              new Date(Date.UTC(anio, 11, 31)),
              { conHora: false },
            );

      const correo = `${rolNombre.toLowerCase()}.${j}@bananotrace.test`;
      const usuario = await prisma.usuario.upsert({
        where: { correo },
        update: {
          idRol,
          nombres,
          apellidos,
          claveHash: passwordHash,
          idProductor,
          estado: true,
          fechaCreacion,
        },
        create: {
          idRol,
          nombres,
          apellidos,
          correo,
          claveHash: passwordHash,
          idProductor,
          estado: true,
          fechaCreacion,
        },
        select: { idUsuario: true },
      });
      ids.push(usuario.idUsuario);
    }
    result[CLAVE_RESULTADO[rolNombre]] = ids;
  };

  await crearGrupo('SUPERVISOR_AGRICOLA', ROLE_IDS.SUPERVISOR_AGRICOLA, true);
  await crearGrupo('GERENTE_PRODUCTOR', ROLE_IDS.GERENTE_PRODUCTOR, true);
  await crearGrupo('CALIDAD', ROLE_IDS.CALIDAD, false);
  await crearGrupo('LOGISTICA', ROLE_IDS.LOGISTICA, false);
  await crearGrupo('CLIENTE', ROLE_IDS.CLIENTE, false);

  console.log('✅ Usuarios de volumen creados.');
  return result;
}
