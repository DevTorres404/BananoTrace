import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
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

  it('stores the token returned by login', () => {
    const response: LoginResponse = {
      access_token: createToken(),
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
    expect(service.isAuthenticated()).toBe(true);
  });

  it('clears the session on logout', () => {
    service.logout();
    expect(localStorage.getItem('token')).toBeNull();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });
});

function createToken(): string {
  const payload = btoa(
    JSON.stringify({ sub: '1', email: 'admin@coil.com', idRol: 1, rol: 'ADMINISTRADOR' }),
  );
  return `header.${payload}.signature`;
}
