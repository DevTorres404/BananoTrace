import { PrismaClient } from '@prisma/client';
import { seedPantallas } from './seeders/pantallas.seeder';
import { seedMenus } from './seeders/menus.seeder';

const prisma = new PrismaClient();

async function main() {
  await seedPantallas(prisma);
  await seedMenus(prisma);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
