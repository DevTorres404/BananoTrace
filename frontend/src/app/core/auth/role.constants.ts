export const ROLE_IDS = {
  ADMINISTRADOR: 1,
  SUPERVISOR_AGRICOLA: 2,
  CALIDAD: 3,
  LOGISTICA: 4,
  CLIENTE: 5,
  GERENTE_PRODUCTOR: 6,
} as const;

export type RoleName = keyof typeof ROLE_IDS;
