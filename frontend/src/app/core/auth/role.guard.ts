import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';
import { AuthService } from '../services/auth';
import { decodeJwtPayload, JwtPayload } from './jwt-payload';

/**
 * Igual que authGuard, si el access token expiró pero hay un refresh token, intenta
 * renovarlo antes de decidir. Es necesario duplicar ese chequeo acá (no alcanza con que
 * authGuard ya lo haga): Angular evalúa los guards de una ruta en paralelo, no en serie,
 * así que roleGuard puede correr con el token todavía vencido mientras authGuard sigue
 * esperando la respuesta de /auth/refresh. AuthService.refreshAccessToken() comparte la
 * llamada en curso, así que esto no duplica la petición HTTP.
 */
export const roleGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const token = typeof window === 'undefined' ? null : localStorage.getItem('token');
  const payload = decodeJwtPayload(token);

  if (payload) {
    return evaluateRole(payload, route, router);
  }

  if (typeof window === 'undefined' || !authService.getRefreshToken()) {
    return router.createUrlTree(['/login']);
  }

  return authService.refreshAccessToken().pipe(
    map((response) => {
      const refreshedPayload = decodeJwtPayload(response.access_token);
      return refreshedPayload
        ? evaluateRole(refreshedPayload, route, router)
        : router.createUrlTree(['/login']);
    }),
    catchError((): Observable<UrlTree> => of(router.createUrlTree(['/login']))),
  );
};

function evaluateRole(
  payload: JwtPayload,
  route: ActivatedRouteSnapshot,
  router: Router,
): boolean | UrlTree {
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
}
