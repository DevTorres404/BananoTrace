import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../domain/authenticated-user';

type TokenPayload = AuthenticatedUser;

interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }

    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: process.env.JWT_SECRET || 'super_secret_jwt_key_here',
      });
      const userId = this.parseUserId(payload.sub);
      const user = await this.prisma.usuario.findUnique({
        where: { idUsuario: userId },
        select: {
          correo: true,
          estado: true,
          idRol: true,
          idProductor: true,
          rol: { select: { nombre: true } },
        },
      });

      if (!user?.estado) {
        throw new UnauthorizedException('Usuario inactivo o inexistente');
      }

      request.user = {
        ...payload,
        sub: userId.toString(),
        email: user.correo,
        idRol: user.idRol,
        rol: user.rol.nombre,
        idProductor: user.idProductor?.toString() ?? null,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private parseUserId(value: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return BigInt(value);
  }
}
