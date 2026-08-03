import { ROLE_IDS } from './core/auth/role.constants';
import { routes } from './app.routes';

describe('application routes', () => {
  it('redirects the legacy plural packages route to the canonical route', () => {
    expect(routes.find((route) => route.path === 'empaques')).toMatchObject({
      redirectTo: 'empaque',
      pathMatch: 'full',
    });
  });

  it('keeps shipment routes restricted to internal logistics roles', () => {
    const expectedRoles = [ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR];

    expect(routes.find((route) => route.path === 'envios')?.data?.['roles']).toEqual(expectedRoles);
    expect(routes.find((route) => route.path === 'envios/:id')?.data?.['roles']).toEqual(
      expectedRoles,
    );
  });
});
