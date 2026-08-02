import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const jwtService = { verifyAsync: jest.fn() };
  const prisma = { usuario: { findUnique: jest.fn() } };
  const guard = new JwtAuthGuard(
    jwtService as unknown as JwtService,
    prisma as unknown as PrismaService,
  );

  const contextFor = (authorization?: string) => {
    const request: { headers: { authorization?: string }; user?: unknown } = {
      headers: { authorization },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  beforeEach(() => jest.clearAllMocks());

  it('refreshes role data from the database instead of trusting a stale token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: '7',
      email: 'old@coil.com',
      idRol: 8,
      rol: 'LOGISTICA_ANTIGUA',
    });
    prisma.usuario.findUnique.mockResolvedValue({
      correo: 'actual@coil.com',
      estado: true,
      idRol: 2,
      idProductor: 11n,
      rol: { nombre: 'PRODUCTOR' },
    });
    const { context, request } = contextFor('Bearer token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(
      expect.objectContaining({
        sub: '7',
        email: 'actual@coil.com',
        idRol: 2,
        rol: 'PRODUCTOR',
        idProductor: '11',
      }),
    );
  });

  it('rejects an inactive user even when the token signature is valid', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: '7',
      email: 'user@coil.com',
      idRol: 4,
      rol: 'LOGISTICA',
    });
    prisma.usuario.findUnique.mockResolvedValue({
      correo: 'user@coil.com',
      estado: false,
      idRol: 4,
      idProductor: null,
      rol: { nombre: 'LOGISTICA' },
    });

    await expect(
      guard.canActivate(contextFor('Bearer token').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
