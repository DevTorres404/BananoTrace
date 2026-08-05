import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { vi } from 'vitest';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  let routerSpy: { createUrlTree: ReturnType<typeof vi.fn> };
  let httpMock: HttpTestingController;
  const redirectTree = {} as UrlTree;
  const state = {} as RouterStateSnapshot;

  beforeEach(() => {
    localStorage.clear();
    routerSpy = { createUrlTree: vi.fn().mockReturnValue(redirectTree) };
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

  it('allows a user whose numeric role is authorized', () => {
    localStorage.setItem('token', createToken({ idRol: 1, rol: 'ADMINISTRADOR' }));
    const route = { data: { roles: [1] } } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => roleGuard(route, state));

    expect(result).toBe(true);
    expect(routerSpy.createUrlTree).not.toHaveBeenCalled();
  });

  it('also accepts role names for routes that still use them', () => {
    localStorage.setItem('token', createToken({ idRol: 1, rol: 'ADMINISTRADOR' }));
    const route = { data: { roles: ['Administrador'] } } as unknown as ActivatedRouteSnapshot;

    expect(TestBed.runInInjectionContext(() => roleGuard(route, state))).toBe(true);
  });

  it('redirects authenticated users without permission to a route safe for their role', () => {
    localStorage.setItem('token', createToken({ idRol: 2, rol: 'SUPERVISOR_AGRICOLA' }));
    const route = { data: { roles: [1] } } as unknown as ActivatedRouteSnapshot;

    expect(TestBed.runInInjectionContext(() => roleGuard(route, state))).toBe(redirectTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/lotes']);
  });

  it('redirects missing or invalid sessions to login', () => {
    const route = { data: { roles: [1] } } as unknown as ActivatedRouteSnapshot;

    expect(TestBed.runInInjectionContext(() => roleGuard(route, state))).toBe(redirectTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('renueva el access token vencido antes de evaluar el rol, en vez de rechazar con datos viejos', () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('refreshToken', 'a-valid-refresh-token');
    const route = { data: { roles: [1] } } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => roleGuard(route, state));
    let resolved: boolean | UrlTree | undefined;
    (result as Observable<boolean | UrlTree>).subscribe((value) => {
      resolved = value;
    });

    const req = httpMock.expectOne('/api/auth/refresh');
    req.flush({
      access_token: createToken({ idRol: 1, rol: 'ADMINISTRADOR' }),
      refresh_token: 'new-refresh-token',
      user: { id: '1', email: 'admin@coil.com', nombres: 'A', apellidos: 'B', idRol: 1, rol: 'ADMINISTRADOR', idProductor: null },
    });

    expect(resolved).toBe(true);
    expect(routerSpy.createUrlTree).not.toHaveBeenCalled();
  });

  it('redirige a login si el token venció y el refresh también falla', () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('refreshToken', 'a-stale-refresh-token');
    const route = { data: { roles: [1] } } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => roleGuard(route, state));
    let resolved: boolean | UrlTree | undefined;
    (result as Observable<boolean | UrlTree>).subscribe((value) => {
      resolved = value;
    });

    const req = httpMock.expectOne('/api/auth/refresh');
    req.flush({ message: 'Token inválido' }, { status: 401, statusText: 'Unauthorized' });

    expect(resolved).toBe(redirectTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});

function createToken(role: { idRol: number; rol: string }): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: '1', email: 'admin@coil.com', ...role })}.signature`;
}
