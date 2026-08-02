import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { decodeJwtPayload } from './jwt-payload';

export const roleGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const token = typeof window === 'undefined' ? null : localStorage.getItem('token');
  const payload = decodeJwtPayload(token);

  if (!payload) {
    return router.createUrlTree(['/login']);
  }

  const expectedRoles = (route.data['roles'] ?? []) as Array<number | string>;
  const authorized =
    expectedRoles.length === 0 ||
    expectedRoles.some((role) =>
      typeof role === 'number'
        ? payload.idRol === role
        : payload.rol.toUpperCase() === role.toUpperCase(),
    );

  return authorized ? true : router.createUrlTree(['/dashboard']);
};
