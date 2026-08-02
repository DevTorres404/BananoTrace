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
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from './users.service';
import type { CreateUserInput, UpdateUserInput } from './users.service';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    idRol: number;
  };
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('navigation')
  getNavigation(@Req() request: AuthenticatedRequest) {
    return this.usersService.getNavigation(request.user.idRol);
  }

  @Roles(1)
  @Get('roles')
  getRoles() {
    return this.usersService.getRoles();
  }

  @Roles(1)
  @Get()
  getAllUsers() {
    return this.usersService.findAll();
  }

  @Roles(1)
  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Roles(1)
  @Post()
  create(@Body() data: CreateUserInput) {
    return this.usersService.create(data);
  }

  @Roles(1)
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

  @Roles(1)
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: UpdateUserInput) {
    return this.usersService.update(id, data);
  }

  @Roles(1)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.remove(id, request.user.sub);
  }
}
