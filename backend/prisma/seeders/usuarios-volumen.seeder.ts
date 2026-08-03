import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_IDS } from '../../src/auth/domain/role.constants';
import type { ProductorVolumen } from './productores-fincas-volumen.seeder';

const CONTEOS = {
  SUPERVISOR_AGRICOLA: 12,
  GERENTE_PRODUCTOR: 8,
  CALIDAD: 10,
  LOGISTICA: 6,
  CLIENTE: 4,
} as const;

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
];

function nombreCompleto(seed: number): { nombres: string; apellidos: string } {
  return {
    nombres: NOMBRES[seed % NOMBRES.length],
    apellidos: APELLIDOS[seed % APELLIDOS.length],
  };
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

  let seed = 0;
  const crearGrupo = async (
    rolNombre: keyof typeof CONTEOS,
    idRol: number,
    vincularProductor: boolean,
    bucket: bigint[],
  ) => {
    const total = CONTEOS[rolNombre];
    for (let i = 0; i < total; i++) {
      const { nombres, apellidos } = nombreCompleto(seed++);
      const correo = `demo.${rolNombre.toLowerCase()}.${i}@coil.com`;
      const idProductor =
        vincularProductor && productores.length > 0
          ? productores[i % productores.length].idProductor
          : null;

      const usuario = await prisma.usuario.upsert({
        where: { correo },
        update: { nombres, apellidos, idRol, idProductor, claveHash: passwordHash, estado: true },
        create: { nombres, apellidos, correo, idRol, idProductor, claveHash: passwordHash, estado: true },
        select: { idUsuario: true },
      });
      bucket.push(usuario.idUsuario);
    }
  };

  await crearGrupo('SUPERVISOR_AGRICOLA', ROLE_IDS.SUPERVISOR_AGRICOLA, true, result.supervisores);
  await crearGrupo('GERENTE_PRODUCTOR', ROLE_IDS.GERENTE_PRODUCTOR, true, result.gerentes);
  await crearGrupo('CALIDAD', ROLE_IDS.CALIDAD, false, result.calidad);
  await crearGrupo('LOGISTICA', ROLE_IDS.LOGISTICA, false, result.logistica);
  await crearGrupo('CLIENTE', ROLE_IDS.CLIENTE, false, result.clientes);

  const total = Object.values(CONTEOS).reduce((sum, n) => sum + n, 0);
  console.log(`✅ ${total} usuarios de volumen creados o actualizados (clave: demo12345).`);
  return result;
}
