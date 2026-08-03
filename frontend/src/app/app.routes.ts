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
    // Angular no permite combinar `redirectTo` con `canActivate` (los redirects ocurren
    // antes que los guards). La ruta destino `usuarios` ya aplica el mismo guard de rol.
    path: 'usuarios/crear',
    redirectTo: 'usuarios',
    pathMatch: 'full',
  },
  {
    path: 'usuarios/:id/editar',
    redirectTo: 'usuarios',
  },
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./features/users/users-list/users-list').then((module) => module.UsersList),
    canActivate: adminGuards,
    data: { roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.GERENTE_PRODUCTOR] },
  },
  {
    path: 'productores',
    loadComponent: () =>
      import('./features/producers/producers-list/producers-list').then(
        (module) => module.ProducersList,
      ),
    canActivate: producerGuards,
    data: { roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR_AGRICOLA] },
  },
  {
    path: 'fincas',
    loadComponent: () =>
      import('./features/farms/farms-page/farms-page').then((module) => module.FarmsPage),
    canActivate: producerGuards,
    data: { roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR_AGRICOLA, ROLE_IDS.GERENTE_PRODUCTOR] },
  },
  {
    path: 'certificaciones',
    loadComponent: () =>
      import('./features/farms/certifications-page/certifications-page').then(
        (module) => module.CertificationsPage,
      ),
    canActivate: producerGuards,
    data: { roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR_AGRICOLA, ROLE_IDS.GERENTE_PRODUCTOR] },
  },
  {
    path: 'lotes/:id',
    loadComponent: () =>
      import('./features/lots/lot-detail/lot-detail').then((module) => module.LotDetail),
    canActivate: producerGuards,
    data: {
      roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR_AGRICOLA, ROLE_IDS.CALIDAD, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR],
    },
  },
  {
    path: 'lotes',
    loadComponent: () =>
      import('./features/lots/lots-page/lots-page').then((module) => module.LotsPage),
    canActivate: producerGuards,
    data: {
      roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR_AGRICOLA, ROLE_IDS.CALIDAD, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR],
    },
  },
  {
    path: 'calidad',
    loadComponent: () =>
      import('./features/quality/quality-page/quality-page').then((module) => module.QualityPage),
    canActivate: producerGuards,
    data: {
      roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.CALIDAD, ROLE_IDS.SUPERVISOR_AGRICOLA, ROLE_IDS.GERENTE_PRODUCTOR],
    },
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
    path: 'empaque',
    loadComponent: () =>
      import('./features/logistics/empaques-page/empaques-page').then(
        (module) => module.EmpaquesPage,
      ),
    canActivate: producerGuards,
    data: {
      roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.CALIDAD, ROLE_IDS.SUPERVISOR_AGRICOLA, ROLE_IDS.GERENTE_PRODUCTOR],
    },
  },
  {
    path: 'envios',
    loadComponent: () =>
      import('./features/logistics/envios-page/envios-page').then((module) => module.EnviosPage),
    canActivate: producerGuards,
    data: {
      roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.CLIENTE, ROLE_IDS.GERENTE_PRODUCTOR],
    },
  },
  {
    path: 'envios/nuevo',
    loadComponent: () =>
      import('./features/logistics/envio-form/envio-form').then((module) => module.EnvioForm),
    canActivate: producerGuards,
    data: {
      roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR],
    },
  },
  {
    path: 'envios/:id',
    loadComponent: () =>
      import('./features/logistics/envio-detail/envio-detail').then((module) => module.EnvioDetail),
    canActivate: producerGuards,
    data: {
      roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.CLIENTE, ROLE_IDS.GERENTE_PRODUCTOR],
    },
  },
  {
    path: 'lotes/:id/linea-tiempo',
    loadComponent: () =>
      import('./features/traceability/lot-timeline/lot-timeline').then(
        (module) => module.LotTimelinePage,
      ),
    canActivate: producerGuards,
    data: {
      roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR_AGRICOLA, ROLE_IDS.CALIDAD, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR],
    },
  },
  {
    path: 'eventos',
    loadComponent: () =>
      import('./features/traceability/events-page/events-page').then((module) => module.EventsPage),
    canActivate: producerGuards,
    data: {
      roles: [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR_AGRICOLA, ROLE_IDS.CALIDAD, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR],
    },
  },
  {
    path: 'blockchain',
    loadComponent: () =>
      import('./features/blockchain/blockchain-page/blockchain-page').then(
        (module) => module.BlockchainPage,
      ),
    canActivate: producerGuards,
    data: {
      roles: [
        ROLE_IDS.ADMINISTRADOR,
        ROLE_IDS.LOGISTICA,
        ROLE_IDS.SUPERVISOR_AGRICOLA,
        ROLE_IDS.GERENTE_PRODUCTOR,
        ROLE_IDS.CALIDAD,
      ],
    },
  },
  {
    path: 'consulta',
    loadComponent: () =>
      import('./features/publico/consulta-page/consulta-page').then(
        (module) => module.ConsultaPage,
      ),
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
