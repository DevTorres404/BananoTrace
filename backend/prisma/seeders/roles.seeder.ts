import { PrismaClient } from '@prisma/client';

export async function seedRoles(prisma: PrismaClient) {
  const roles = [
    { idRol: 1, nombre: 'ADMINISTRADOR', descripcion: 'Administrador del sistema de trazabilidad' },
    { idRol: 2, nombre: 'PRODUCTOR', descripcion: 'Productor bananero o administrador de finca' },
    { idRol: 3, nombre: 'TECNICO_AGRICOLA', descripcion: 'Técnico encargado de actividades de manejo e inspección del cultivo' },
    { idRol: 4, nombre: 'INSPECTOR_CALIDAD', descripcion: 'Responsable de controles de calidad e inocuidad' },
    { idRol: 5, nombre: 'EMPACADOR', descripcion: 'Personal de empacadora: recepción, clasificación y empaque' },
    { idRol: 6, nombre: 'TRANSPORTISTA', descripcion: 'Encargado del traslado entre finca, empacadora y puerto' },
    { idRol: 7, nombre: 'EXPORTADOR', descripcion: 'Responsable de consolidar documentación y coordinar embarque' },
    { idRol: 8, nombre: 'LOGISTICA', descripcion: 'Encargado de envíos y contenedores' },
    { idRol: 9, nombre: 'CONSULTOR', descripcion: 'Usuario autorizado para consultar historial de lotes' },
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
