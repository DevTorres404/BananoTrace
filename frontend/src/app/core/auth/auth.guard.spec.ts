import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { vi } from 'vitest';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  const redirectTree = {} as UrlTree;
  let routerSpy: { createUrlTree: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> };
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    routerSpy = {
      createUrlTree: vi.fn().mockReturnValue(redirectTree),
      navigate: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('allows navigation with a valid token', () => {
    localStorage.setItem('token', createToken());
    expect(TestBed.runInInjectionContext(() => authGuard({} as never, {} as never))).toBe(true);
  });

  it('redirects to login when the token is invalid and there is no refresh token', () => {
    localStorage.setItem('token', 'invalid-token');
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result).toBe(redirectTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('refreshes the session when the access token expired but a refresh token exists', () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('refreshToken', 'a-valid-refresh-token');

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    let resolved: boolean | UrlTree | undefined;
    (result as import('rxjs').Observable<boolean | UrlTree>).subscribe((value) => {
      resolved = value;
    });

    const req = httpMock.expectOne('/api/auth/refresh');
    expect(req.request.body).toEqual({ refresh_token: 'a-valid-refresh-token' });
    req.flush({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      user: { id: '1', email: 'a@coil.com', nombres: 'A', apellidos: 'B', idRol: 1, rol: 'ADMINISTRADOR', idProductor: null },
    });

    expect(resolved).toBe(true);
    expect(localStorage.getItem('token')).toBe('new-access-token');
  });

  it('redirects to login when the refresh token itself is rejected', () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('refreshToken', 'a-stale-refresh-token');

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    let resolved: boolean | UrlTree | undefined;
    (result as import('rxjs').Observable<boolean | UrlTree>).subscribe((value) => {
      resolved = value;
    });

    const req = httpMock.expectOne('/api/auth/refresh');
    req.flush({ message: 'Token de actualización inválido o expirado' }, { status: 401, statusText: 'Unauthorized' });

    expect(resolved).toBe(redirectTree);
  });
});

function createToken(): string {
  const payload = btoa(
    JSON.stringify({ sub: '1', email: 'admin@coil.com', idRol: 1, rol: 'ADMINISTRADOR' }),
  );
  return `header.${payload}.signature`;
}
