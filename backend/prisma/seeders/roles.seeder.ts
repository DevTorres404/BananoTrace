import { PrismaClient } from '@prisma/client';
import { ROLE_IDS } from '../../src/auth/domain/role.constants';

const roles = [
  {
    idRol: ROLE_IDS.ADMINISTRADOR,
    nombre: 'ADMINISTRADOR',
    descripcion: 'Administración, configuración y seguridad del sistema',
  },
  {
    idRol: ROLE_IDS.PRODUCTOR,
    nombre: 'PRODUCTOR',
    descripcion: 'Gestión de finca, producción y actividades agrícolas',
  },
  {
    idRol: ROLE_IDS.CALIDAD,
    nombre: 'CALIDAD',
    descripcion: 'Control de calidad, inocuidad, clasificación y empaque',
  },
  {
    idRol: ROLE_IDS.LOGISTICA,
    nombre: 'LOGISTICA',
    descripcion: 'Transporte, documentación, envíos y exportación',
  },
  {
    idRol: ROLE_IDS.CLIENTE,
    nombre: 'CLIENTE',
    descripcion: 'Cliente B2B autorizado para consultar trazabilidad de lotes',
  },
] as const;

export async function seedRoles(prisma: PrismaClient) {
  for (const role of roles) {
    await prisma.rol.upsert({
      where: { idRol: role.idRol },
      update: { nombre: role.nombre, descripcion: role.descripcion },
      create: role,
    });
  }

  console.log('✅ Cinco roles canónicos creados o actualizados.');
}
