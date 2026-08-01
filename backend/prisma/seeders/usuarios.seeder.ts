import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedUsuarios(prisma: PrismaClient) {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const passwordHash = await bcrypt.hash('admin123', saltRounds);

  await prisma.usuario.upsert({
    where: { correo: 'admin@coil.com' },
    update: {},
    create: {
      nombres: 'Super',
      apellidos: 'Admin',
      correo: 'admin@coil.com',
      claveHash: passwordHash,
      idRol: 1, // ADMINISTRADOR
      estado: true,
    },
  });

  await prisma.usuario.upsert({
    where: { correo: 'productor@coil.com' },
    update: {},
    create: {
      nombres: 'Juan',
      apellidos: 'Pérez',
      correo: 'productor@coil.com',
      claveHash: passwordHash,
      idRol: 2, // PRODUCTOR
      estado: true,
    },
  });

  await prisma.usuario.upsert({
    where: { correo: 'inspector@coil.com' },
    update: {},
    create: {
      nombres: 'María',
      apellidos: 'Gómez',
      correo: 'inspector@coil.com',
      claveHash: passwordHash,
      idRol: 3, // INSPECTOR_CALIDAD
      estado: true,
    },
  });

  await prisma.usuario.upsert({
    where: { correo: 'empacador@coil.com' },
    update: {},
    create: {
      nombres: 'Carlos',
      apellidos: 'López',
      correo: 'empacador@coil.com',
      claveHash: passwordHash,
      idRol: 4, // EMPACADOR
      estado: true,
    },
  });

  await prisma.usuario.upsert({
    where: { correo: 'logistica@coil.com' },
    update: {},
    create: {
      nombres: 'Ana',
      apellidos: 'Martínez',
      correo: 'logistica@coil.com',
      claveHash: passwordHash,
      idRol: 5, // LOGISTICA
      estado: true,
    },
  });

  console.log('✅ Usuarios iniciales creados.');
  console.log('--- Credenciales de prueba ---');
  console.log('Admin: admin@coil.com / admin123');
  console.log('Productor: productor@coil.com / admin123');
  console.log('Inspector: inspector@coil.com / admin123');
  console.log('Empacador: empacador@coil.com / admin123');
  console.log('Logística: logistica@coil.com / admin123');
}
