import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateUserInput, UsersService } from '../users/users.service';

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

    const payload = {
      sub: user.idUsuario.toString(),
      email: user.correo,
      idRol: user.idRol,
      rol: user.rol.nombre,
    };
    const token = await this.jwtService.signAsync(payload);

    return {
      access_token: token,
      user: {
        id: user.idUsuario.toString(),
        email: user.correo,
        nombres: user.nombres,
        apellidos: user.apellidos,
        idRol: user.idRol,
        rol: user.rol.nombre,
      },
    };
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
}
