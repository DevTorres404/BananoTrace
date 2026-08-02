import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { vi } from 'vitest';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  const redirectTree = {} as UrlTree;
  let routerSpy: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    routerSpy = { createUrlTree: vi.fn().mockReturnValue(redirectTree) };
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: routerSpy }],
    });
  });

  it('allows navigation with a valid token', () => {
    localStorage.setItem('token', createToken());
    expect(TestBed.runInInjectionContext(() => authGuard({} as never, {} as never))).toBe(true);
  });

  it('redirects invalid or missing sessions to login', () => {
    localStorage.setItem('token', 'invalid-token');
    expect(TestBed.runInInjectionContext(() => authGuard({} as never, {} as never))).toBe(
      redirectTree,
    );
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});

function createToken(): string {
  const payload = btoa(
    JSON.stringify({ sub: '1', email: 'admin@coil.com', idRol: 1, rol: 'ADMINISTRADOR' }),
  );
  return `header.${payload}.signature`;
}
