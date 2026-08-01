import { PrismaClient } from '@prisma/client';

export async function seedRoles(prisma: PrismaClient) {
  const roles = [
    { idRol: 1, nombre: 'ADMINISTRADOR', descripcion: 'Administrador del sistema de trazabilidad' },
    { idRol: 2, nombre: 'PRODUCTOR', descripcion: 'Productor bananero en finca' },
    { idRol: 3, nombre: 'INSPECTOR_CALIDAD', descripcion: 'Inspector que realiza los controles de calidad' },
    { idRol: 4, nombre: 'EMPACADOR', descripcion: 'Personal encargado de la caja y código QR' },
    { idRol: 5, nombre: 'LOGISTICA', descripcion: 'Encargado de envíos y contenedores' },
  ];

  for (const rol of roles) {
    await prisma.rol.upsert({
      where: { nombre: rol.nombre },
      update: {},
      create: rol,
    });
  }
  console.log('✅ Roles creados o actualizados.');
}
