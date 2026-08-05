import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth';

/** Endpoints donde un 401 nunca debe disparar un refresh (evita bucles infinitos). */
const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/refresh'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  const token = typeof window !== 'undefined' ? authService.getToken() : null;
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) => req.url.includes(endpoint));
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isAuthEndpoint &&
        authService.getRefreshToken()
      ) {
        return authService.refreshAccessToken().pipe(
          switchMap((session) => {
            const retriedReq = req.clone({
              setHeaders: { Authorization: `Bearer ${session.access_token}` },
            });
            return next(retriedReq);
          }),
          catchError(() => throwError(() => error)),
        );
      }
      return throwError(() => error);
    }),
  );
};
