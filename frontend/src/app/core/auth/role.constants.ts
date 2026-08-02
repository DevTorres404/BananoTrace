export const ROLE_IDS = {
  ADMINISTRADOR: 1,
  PRODUCTOR: 2,
  CALIDAD: 3,
  LOGISTICA: 4,
  CLIENTE: 5,
} as const;

export type RoleName = keyof typeof ROLE_IDS;
