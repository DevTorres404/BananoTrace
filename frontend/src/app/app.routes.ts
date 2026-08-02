import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { ROLE_IDS } from './core/auth/role.constants';
import { roleGuard } from './core/auth/role.guard';

import { guestGuard } from './core/auth/guest.guard';

const adminGuards = [authGuard, roleGuard];
const producerGuards = [authGuard, roleGuard];

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
    data: { roles: [ROLE_IDS.ADMINISTRADOR] },
  },
  {
    path: 'usuarios/:id/editar',
    redirectTo: 'usuarios',
    canActivate: adminGuards,
    data: { roles: [ROLE_IDS.ADMINISTRADOR] },
  },
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./features/users/users-list/users-list').then((module) => module.UsersList),
    canActivate: adminGuards,
    data: { roles: [ROLE_IDS.ADMINISTRADOR] },
  },
  {
    path: 'productores',
    loadComponent: () =>
      import('./features/producers/producers-list/producers-list').then(
        (module) => module.ProducersList,
      ),
    canActivate: producerGuards,
    data: { roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.PRODUCTOR] },
  },
  {
    path: 'fincas',
    loadComponent: () =>
      import('./features/farms/farms-page/farms-page').then((module) => module.FarmsPage),
    canActivate: producerGuards,
    data: { roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.PRODUCTOR] },
  },
  {
    path: 'certificaciones',
    loadComponent: () =>
      import('./features/farms/certifications-page/certifications-page').then(
        (module) => module.CertificationsPage,
      ),
    canActivate: producerGuards,
    data: { roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.PRODUCTOR] },
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
