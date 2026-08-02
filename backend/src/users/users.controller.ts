import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/domain/authenticated-user';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from './users.service';
import type { CreateUserInput, UpdateUserInput } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('navigation')
  getNavigation(@Req() request: AuthenticatedRequest) {
    return this.usersService.getNavigation(request.user.idRol);
  }

  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Get('roles')
  getRoles() {
    return this.usersService.getRoles();
  }

  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Get()
  getAllUsers() {
    return this.usersService.findAll();
  }

  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Post()
  create(@Body() data: CreateUserInput) {
    return this.usersService.create(data);
  }

  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body('estado') estado: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    if (typeof estado !== 'boolean') {
      throw new BadRequestException('El estado debe ser booleano');
    }
    return this.usersService.setStatus(id, estado, request.user.sub);
  }

  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: UpdateUserInput) {
    return this.usersService.update(id, data);
  }

  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.remove(id, request.user.sub);
  }
}
