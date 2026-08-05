import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));
const mockedCompare = bcrypt.compare as unknown as jest.Mock;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock; findById: jest.Mock; create: jest.Mock };
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  const userRow = {
    idUsuario: 7n,
    correo: 'ana@coil.com',
    nombres: 'Ana',
    apellidos: 'Torres',
    claveHash: 'hashed',
    idRol: 2,
    idProductor: null,
    estado: true,
    rol: { nombre: 'SUPERVISOR_AGRICOLA' },
  };

  beforeEach(async () => {
    usersService = { findByEmail: jest.fn(), findById: jest.fn(), create: jest.fn() };
    jwtService = { signAsync: jest.fn(), verifyAsync: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('returns an access token and a refresh token signed with different secrets', async () => {
      usersService.findByEmail.mockResolvedValue(userRow);
      mockedCompare.mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('access.jwt.token')
        .mockResolvedValueOnce('refresh.jwt.token');

      const result = await service.login('ana@coil.com', 'password123');

      expect(result.access_token).toBe('access.jwt.token');
      expect(result.refresh_token).toBe('refresh.jwt.token');
      expect(result.user).toEqual(
        expect.objectContaining({ id: '7', email: 'ana@coil.com', rol: 'SUPERVISOR_AGRICOLA' }),
      );
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
      const [accessCall, refreshCall] = jwtService.signAsync.mock.calls;
      expect(accessCall[1]).toBeUndefined();
      expect(refreshCall[0]).toEqual({ sub: '7', type: 'refresh' });
      expect(refreshCall[1]).toEqual(
        expect.objectContaining({ secret: expect.any(String), expiresIn: expect.any(String) }),
      );
      expect(refreshCall[1].secret).not.toBe(undefined);
    });

    it('rejects an inactive user', async () => {
      usersService.findByEmail.mockResolvedValue({ ...userRow, estado: false });

      await expect(service.login('ana@coil.com', 'password123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('re-issues a token pair for a valid, active-user refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: '7', type: 'refresh' });
      usersService.findById.mockResolvedValue(userRow);
      jwtService.signAsync
        .mockResolvedValueOnce('new.access.token')
        .mockResolvedValueOnce('new.refresh.token');

      const result = await service.refresh('some.refresh.token');

      expect(usersService.findById).toHaveBeenCalledWith(7n);
      expect(result.access_token).toBe('new.access.token');
      expect(result.refresh_token).toBe('new.refresh.token');
    });

    it('rejects a token whose payload is not a refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: '7', type: undefined });

      await expect(service.refresh('access.token.used.as.refresh')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('rejects an expired or invalid refresh token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.refresh('expired.token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a refresh token for a since-deactivated user', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: '7', type: 'refresh' });
      usersService.findById.mockResolvedValue({ ...userRow, estado: false });

      await expect(service.refresh('some.refresh.token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects when no refresh token is provided', async () => {
      await expect(service.refresh('')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });
  });
});
