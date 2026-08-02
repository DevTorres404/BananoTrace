import { PrismaClient } from '@prisma/client';
import { ROLE_IDS } from '../../src/auth/domain/role.constants';

const ALL_MENUS = [1, 2, 3, 4, 5, 10, 11, 12, 13, 20, 21, 22, 23, 30, 31, 40];

const assignments: Record<number, number[]> = {
  [ROLE_IDS.ADMINISTRADOR]: ALL_MENUS,
  [ROLE_IDS.SUPERVISOR_AGRICOLA]: [1, 2, 3, 4, 11, 12, 13, 20, 21, 31],
  [ROLE_IDS.GERENTE_PRODUCTOR]: [1, 2, 3, 4, 5, 11, 12, 13, 20, 21, 22, 23, 30, 31, 40],
  [ROLE_IDS.CALIDAD]: [1, 2, 3, 12, 20, 21, 22],
  [ROLE_IDS.LOGISTICA]: [1, 2, 3, 4, 12, 20, 22, 23, 30, 31],
  [ROLE_IDS.CLIENTE]: [1, 4, 31],
};

export async function seedRolMenus(prisma: PrismaClient) {
  const canonicalRoleIds = Object.keys(assignments).map(Number);

  await prisma.$transaction(async (transaction) => {
    await transaction.rolMenu.deleteMany({
      where: { idRol: { in: canonicalRoleIds } },
    });

    await transaction.rolMenu.createMany({
      data: Object.entries(assignments).flatMap(([roleId, menuIds]) =>
        menuIds.map((menuId) => ({ idRol: Number(roleId), idMenu: menuId })),
      ),
    });
  });

  console.log('✅ Permisos exactos de menú asignados a los seis roles.');
}
