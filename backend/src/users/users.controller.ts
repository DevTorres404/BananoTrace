import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getAllUsers() {
    const users = await this.prisma.usuario.findMany({
      include: {
        rol: true,
      },
    });

    // Mapeo necesario para convertir BigInt a String y evitar errores de serialización JSON nativos
    return users.map((user) => ({
      ...user,
      idUsuario: user.idUsuario.toString(),
    }));
  }
}
