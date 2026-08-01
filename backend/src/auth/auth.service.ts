import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async login(email: string, pass: string) {
    console.time('DB Query');
    const user = await this.usersService.findByEmail(email);
    console.timeEnd('DB Query');
    
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    console.time('Bcrypt Compare');
    const isMatch = await bcrypt.compare(pass, user.claveHash);
    console.timeEnd('Bcrypt Compare');
    
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: user.idUsuario.toString(),
      email: user.correo,
      rol: user.rol.nombre
    };

    console.time('JWT Sign');
    const token = await this.jwtService.signAsync(payload);
    console.timeEnd('JWT Sign');

    return {
      access_token: token,
      user: {
        id: user.idUsuario.toString(),
        email: user.correo,
        nombres: user.nombres,
        apellidos: user.apellidos,
        rol: user.rol.nombre
      }
    };
  }
}
