import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Seeders in dependency order
import { seedRoles } from './seeders/roles.seeder';
import { seedUsuarios } from './seeders/usuarios.seeder';
import { seedTiposEvento } from './seeders/tipos-evento.seeder';
import { seedPantallas } from './seeders/pantallas.seeder';
import { seedMenus } from './seeders/menus.seeder';
import { seedRolMenus } from './seeders/rol-menus.seeder';
import { seedFlujos } from './seeders/flujos.seeder';

dotenv.config({ path: path.join(__dirname, '../.env') });
const port = process.env.POSTGRES_PORT || '5432';
const user = encodeURIComponent(process.env.POSTGRES_USER || '');
const pass = encodeURIComponent(process.env.POSTGRES_PASSWORD || '');
const connectionString = process.env.DATABASE_URL || `postgresql://${user}:${pass}@${process.env.POSTGRES_HOST}:${port}/${process.env.POSTGRES_DB}?schema=public`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando seed de base de datos...\n');

  // 1. Catálogos base (sin dependencias)
  await seedRoles(prisma);
  await seedTiposEvento(prisma);
  await seedPantallas(prisma);
  await seedFlujos(prisma);

  // 2. Dependen de roles
  await seedUsuarios(prisma);
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
