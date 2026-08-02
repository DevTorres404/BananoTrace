import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { CreateUserInput } from '../users/users.service';
import { AuthService } from './auth.service';
import { ROLE_IDS } from './domain/role.constants';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() signInDto: { email: string; password: string }) {
    return this.authService.login(signInDto.email, signInDto.password);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Post('register')
  register(@Body() registerDto: CreateUserInput) {
    return this.authService.register(registerDto);
  }
}
