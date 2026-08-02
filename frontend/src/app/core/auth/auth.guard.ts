import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { decodeJwtPayload } from './jwt-payload';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = typeof window === 'undefined' ? null : localStorage.getItem('token');
  return decodeJwtPayload(token) ? true : router.createUrlTree(['/login']);
};
