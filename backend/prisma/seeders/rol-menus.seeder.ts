import { PrismaClient } from '@prisma/client';

/**
 * Assigns menus to roles based on the COIL project actor definitions.
 *
 * ADMINISTRADOR (1)  → All menus
 * PRODUCTOR (2)      → Dashboard, Producción (all children), Eventos, Consulta
 * TECNICO_AGRICOLA (3) → Dashboard, Lotes, Eventos, Calidad
 * INSPECTOR_CALIDAD (4) → Dashboard, Lotes, Eventos, Calidad
 * EMPACADOR (5)      → Dashboard, Lotes, Eventos, Calidad, Empaque
 * TRANSPORTISTA (6)  → Dashboard, Envíos, Consulta
 * EXPORTADOR (7)     → Dashboard, Envíos, Consulta, Blockchain
 * LOGISTICA (8)      → Dashboard, Empaque, Envíos, Consulta
 * CONSULTOR (9)      → Dashboard, Consulta
 */
export async function seedRolMenus(prisma: PrismaClient) {
  // Menu IDs reference:
  // 1=Inicio/Dashboard, 2=Producción(parent), 3=Procesos(parent), 4=Trazabilidad(parent), 5=Admin(parent)
  // 10=Productores, 11=Fincas, 12=Lotes, 13=Certificaciones
  // 20=Eventos, 21=Calidad, 22=Empaque, 23=Envíos
  // 30=Blockchain, 31=Consulta Lote
  // 40=Usuarios

  const ALL_MENUS = [1, 2, 3, 4, 5, 10, 11, 12, 13, 20, 21, 22, 23, 30, 31, 40];

  const assignments: Record<number, number[]> = {
    1: ALL_MENUS,                                           // ADMINISTRADOR
    2: [1, 2, 10, 11, 12, 13, 20, 4, 31],                  // PRODUCTOR
    3: [1, 2, 12, 3, 20, 21],                               // TECNICO_AGRICOLA
    4: [1, 2, 12, 3, 20, 21],                               // INSPECTOR_CALIDAD
    5: [1, 2, 12, 3, 20, 21, 22],                           // EMPACADOR
    6: [1, 3, 23, 4, 31],                                   // TRANSPORTISTA
    7: [1, 3, 23, 4, 30, 31],                               // EXPORTADOR
    8: [1, 3, 22, 23, 4, 31],                               // LOGISTICA
    9: [1, 4, 31],                                          // CONSULTOR
  };

  for (const [rolId, menuIds] of Object.entries(assignments)) {
    for (const menuId of menuIds) {
      await prisma.rolMenu.upsert({
        where: {
          idRol_idMenu: { idRol: parseInt(rolId), idMenu: menuId },
        },
        update: {},
        create: {
          idRol: parseInt(rolId),
          idMenu: menuId,
        },
      });
    }
  }
  console.log('✅ Permisos de menú por rol asignados.');
}
