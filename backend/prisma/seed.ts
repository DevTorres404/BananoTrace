import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Seeders in dependency order
import { seedRoles } from './seeders/roles.seeder';
import { seedUsuarios } from './seeders/usuarios.seeder';
import { seedTiposEvento } from './seeders/tipos-evento.seeder';
import { seedVariedades } from './seeders/variedades.seeder';
import { seedPantallas } from './seeders/pantallas.seeder';
import { seedMenus } from './seeders/menus.seeder';
import { seedRolMenus } from './seeders/rol-menus.seeder';
import { seedFlujos } from './seeders/flujos.seeder';
import { seedProductores } from './seeders/productores.seeder';
import { seedFincas } from './seeders/fincas.seeder';

dotenv.config({ path: path.join(__dirname, '../.env') });

function resolveDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl && !configuredUrl.includes('${')) {
    return configuredUrl;
  }

  const requiredVariables = [
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_HOST',
    'POSTGRES_DB',
  ] as const;
  const missingVariables = requiredVariables.filter(
    (variable) => !process.env[variable],
  );
  if (missingVariables.length > 0) {
    throw new Error(
      `Missing database configuration: ${missingVariables.join(', ')}`,
    );
  }

  const port = process.env.POSTGRES_PORT || '5432';
  const user = encodeURIComponent(process.env.POSTGRES_USER!);
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD!);
  const host = process.env.POSTGRES_HOST!;
  const database = process.env.POSTGRES_DB!;
  return `postgresql://${user}:${password}@${host}:${port}/${database}?schema=public`;
}

const connectionString = resolveDatabaseUrl();
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando seed de base de datos...\n');

  // 1. Catálogos base (sin dependencias)
  await seedRoles(prisma);
  await seedTiposEvento(prisma);
  await seedVariedades(prisma);
  await seedPantallas(prisma);
  await seedFlujos(prisma);
  const productorCanonico = await seedProductores(prisma);

  // 2. Dependen de roles
  await seedUsuarios(prisma, productorCanonico.idProductor);
  await seedFincas(prisma, productorCanonico.idProductor);
  await seedMenus(prisma);

  // 3. Depende de roles + menus
  await seedRolMenus(prisma);

  console.log('\n🌱 Seed finalizado exitosamente.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
