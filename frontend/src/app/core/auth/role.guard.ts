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

  if (authorized) {
    return true;
  }

  // Redirect to a role-appropriate safe route to avoid infinite loops
  switch (payload.idRol) {
    case 1: // ADMINISTRADOR
      return router.createUrlTree(['/dashboard']);
    case 2: // SUPERVISOR_AGRICOLA
    case 6: // GERENTE_PRODUCTOR
      return router.createUrlTree(['/lotes']);
    case 3: // CALIDAD
      return router.createUrlTree(['/calidad']);
    case 4: // LOGISTICA
      return router.createUrlTree(['/envios']);
    default:
      return router.createUrlTree(['/login']); // Fallback
  }
};
