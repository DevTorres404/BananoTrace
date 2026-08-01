import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Importar los seeders modulares
import { seedRoles } from './seeders/roles.seeder';
import { seedUsuarios } from './seeders/usuarios.seeder';

dotenv.config({ path: path.join(__dirname, '../.env') });
const connectionString = `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}?schema=public`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando el seeder de base de datos...');

  // Ejecutar los seeders en orden de dependencias
  await seedRoles(prisma);
  await seedUsuarios(prisma);

  console.log('🌱 Proceso de seed finalizado exitosamente.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
