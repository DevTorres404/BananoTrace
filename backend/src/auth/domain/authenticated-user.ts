import type { Request } from 'express';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  idRol: number;
  rol: string;
  idProductor: string | null;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
