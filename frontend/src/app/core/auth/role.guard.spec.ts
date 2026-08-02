import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { vi } from 'vitest';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  let routerSpy: { createUrlTree: ReturnType<typeof vi.fn> };
  const redirectTree = {} as UrlTree;
  const state = {} as RouterStateSnapshot;

  beforeEach(() => {
    localStorage.clear();
    routerSpy = { createUrlTree: vi.fn().mockReturnValue(redirectTree) };
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: routerSpy }],
    });
  });

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

  it('redirects authenticated users without permission to the dashboard', () => {
    localStorage.setItem('token', createToken({ idRol: 2, rol: 'PRODUCTOR' }));
    const route = { data: { roles: [1] } } as unknown as ActivatedRouteSnapshot;

    expect(TestBed.runInInjectionContext(() => roleGuard(route, state))).toBe(redirectTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });

  it('redirects missing or invalid sessions to login', () => {
    const route = { data: { roles: [1] } } as unknown as ActivatedRouteSnapshot;

    expect(TestBed.runInInjectionContext(() => roleGuard(route, state))).toBe(redirectTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});

function createToken(role: { idRol: number; rol: string }): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: '1', email: 'admin@coil.com', ...role })}.signature`;
}
