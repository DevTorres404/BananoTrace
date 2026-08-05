import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { AuthService, LoginResponse } from './auth';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerSpy: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    routerSpy = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('stores the access and refresh tokens returned by login', () => {
    const response: LoginResponse = {
      access_token: createToken(),
      refresh_token: 'a-refresh-token',
      user: {
        id: '1',
        email: 'admin@coil.com',
        nombres: 'Admin',
        apellidos: 'BananoTrace',
        idRol: 1,
        rol: 'ADMINISTRADOR',
        idProductor: null,
      },
    };

    service.login({ email: 'admin@coil.com', password: 'password' }).subscribe();
    const request = httpMock.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    request.flush(response);

    expect(localStorage.getItem('token')).toBe(response.access_token);
    expect(localStorage.getItem('refreshToken')).toBe('a-refresh-token');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('clears both tokens on logout', () => {
    localStorage.setItem('token', createToken());
    localStorage.setItem('refreshToken', 'a-refresh-token');

    service.logout();

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('refreshes the session and updates the stored tokens', async () => {
    localStorage.setItem('refreshToken', 'old-refresh-token');

    const pending = firstValueFrom(service.refreshAccessToken());
    const request = httpMock.expectOne('/api/auth/refresh');
    expect(request.request.body).toEqual({ refresh_token: 'old-refresh-token' });
    request.flush({
      access_token: createToken(),
      refresh_token: 'new-refresh-token',
      user: {
        id: '1',
        email: 'admin@coil.com',
        nombres: 'Admin',
        apellidos: 'BananoTrace',
        idRol: 1,
        rol: 'ADMINISTRADOR',
        idProductor: null,
      },
    });

    await pending;
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh-token');
  });

  it('shares a single in-flight refresh call between concurrent callers', () => {
    localStorage.setItem('refreshToken', 'old-refresh-token');

    service.refreshAccessToken().subscribe();
    service.refreshAccessToken().subscribe();

    httpMock.expectOne('/api/auth/refresh').flush({
      access_token: createToken(),
      refresh_token: 'new-refresh-token',
      user: {
        id: '1',
        email: 'admin@coil.com',
        nombres: 'Admin',
        apellidos: 'BananoTrace',
        idRol: 1,
        rol: 'ADMINISTRADOR',
        idProductor: null,
      },
    });
  });

  it('logs out without an HTTP call when there is no refresh token to use', async () => {
    await expect(firstValueFrom(service.refreshAccessToken())).rejects.toThrow();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });
});

function createToken(): string {
  const payload = btoa(
    JSON.stringify({ sub: '1', email: 'admin@coil.com', idRol: 1, rol: 'ADMINISTRADOR' }),
  );
  return `header.${payload}.signature`;
}
