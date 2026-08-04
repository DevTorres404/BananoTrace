import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock; register: jest.Mock; refresh: jest.Mock };

  beforeEach(async () => {
    authService = { login: jest.fn(), register: jest.fn(), refresh: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: { usuario: { findUnique: jest.fn() } },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates token refresh to the service with the provided refresh token', () => {
    controller.refresh({ refresh_token: 'a.refresh.token' });

    expect(authService.refresh).toHaveBeenCalledWith('a.refresh.token');
  });
});
