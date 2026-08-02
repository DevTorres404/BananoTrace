import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

import { guestGuard } from './core/auth/guest.guard';

const adminGuards = [authGuard, roleGuard];

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((module) => module.Login),
    canActivate: [guestGuard],
  },
  {
    path: 'usuarios/crear',
    redirectTo: 'usuarios',
    pathMatch: 'full',
    canActivate: adminGuards,
    data: { roles: [1] },
  },
  {
    path: 'usuarios/:id/editar',
    redirectTo: 'usuarios',
    canActivate: adminGuards,
    data: { roles: [1] },
  },
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./features/users/users-list/users-list').then((module) => module.UsersList),
    canActivate: adminGuards,
    data: { roles: [1] },
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./shared/feature-placeholder/feature-placeholder').then(
        (module) => module.FeaturePlaceholder,
      ),
    canActivate: [authGuard],
    data: { title: 'Panel principal' },
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./shared/feature-placeholder/feature-placeholder').then(
        (module) => module.FeaturePlaceholder,
      ),
    canActivate: [authGuard],
  },
];
