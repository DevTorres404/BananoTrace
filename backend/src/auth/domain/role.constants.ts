export const ROLE_IDS = {
  ADMINISTRADOR: 1,
  PRODUCTOR: 2,
  CALIDAD: 3,
  LOGISTICA: 4,
  CLIENTE: 5,
} as const;

export const ROLE_NAMES = Object.keys(ROLE_IDS) as Array<keyof typeof ROLE_IDS>;

export type RoleName = (typeof ROLE_NAMES)[number];
