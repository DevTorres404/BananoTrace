import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { CreateUserInput, UsersService } from '../users/users.service';

const REFRESH_TOKEN_TYPE = 'refresh';

interface UserWithRole {
  idUsuario: bigint;
  correo: string;
  nombres: string;
  apellidos: string;
  idRol: number;
  idProductor: bigint | null;
  estado: boolean;
  rol: { nombre: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    if (!email || !password) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const user = await this.usersService.findByEmail(email);

    if (!user || !user.estado) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const matches = await bcrypt.compare(password, user.claveHash);
    if (!matches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.issueSession(user);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Token de actualización no proporcionado');
    }

    let payload: { sub: string; type?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.refreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Token de actualización inválido o expirado');
    }
    if (payload.type !== REFRESH_TOKEN_TYPE) {
      throw new UnauthorizedException('Token de actualización inválido');
    }

    const userId = this.parseUserId(payload.sub);
    const user = await this.usersService.findById(userId);
    if (!user || !user.estado) {
      throw new UnauthorizedException('Usuario inactivo o inexistente');
    }

    return this.issueSession(user);
  }

  async register(data: CreateUserInput) {
    const newUser = await this.usersService.create({
      nombres: data.nombres,
      apellidos: data.apellidos,
      correo: data.correo,
      password: data.password ?? data.clave,
      idRol: data.idRol,
    });

    return {
      message: 'Usuario registrado exitosamente',
      user: {
        id: newUser.idUsuario,
        email: newUser.correo,
      },
    };
  }

  private async issueSession(user: UserWithRole) {
    const accessPayload = {
      sub: user.idUsuario.toString(),
      email: user.correo,
      idRol: user.idRol,
      rol: user.rol.nombre,
      idProductor: user.idProductor?.toString() ?? null,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload),
      this.jwtService.signAsync(
        { sub: user.idUsuario.toString(), type: REFRESH_TOKEN_TYPE },
        { secret: this.refreshSecret(), expiresIn: this.refreshExpiresIn() },
      ),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.idUsuario.toString(),
        email: user.correo,
        nombres: user.nombres,
        apellidos: user.apellidos,
        idRol: user.idRol,
        rol: user.rol.nombre,
        idProductor: user.idProductor?.toString() ?? null,
      },
    };
  }

  private refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET || 'super_secret_jwt_refresh_key_here';
  }

  private refreshExpiresIn(): StringValue {
    return (process.env.JWT_REFRESH_EXPIRES_IN as StringValue) || '7d';
  }

  private parseUserId(value: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new UnauthorizedException('Token de actualización inválido');
    }
    return BigInt(value);
  }
}
