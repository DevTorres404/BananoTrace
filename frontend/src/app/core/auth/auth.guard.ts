import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth';
import { decodeJwtPayload } from './jwt-payload';

/**
 * Si el access token todavía es válido, pasa directo. Si expiró pero hay un refresh token
 * guardado, intenta renovarlo antes de decidir — evita mandar al login a alguien cuya
 * sesión todavía es válida solo porque el access token (de vida corta) venció.
 */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const token = typeof window === 'undefined' ? null : localStorage.getItem('token');

  if (decodeJwtPayload(token)) return true;
  if (typeof window === 'undefined' || !authService.getRefreshToken()) {
    return router.createUrlTree(['/login']);
  }

  return authService.refreshAccessToken().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};
