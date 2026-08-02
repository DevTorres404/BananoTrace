export interface JwtPayload {
  sub: string;
  email: string;
  idRol: number;
  rol: string;
  exp?: number;
}

export function decodeJwtPayload(token: string | null): JwtPayload | null {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as JwtPayload;

    if (!payload.sub || !Number.isInteger(payload.idRol) || !payload.rol) return null;
    if (payload.exp && payload.exp * 1000 <= Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}
