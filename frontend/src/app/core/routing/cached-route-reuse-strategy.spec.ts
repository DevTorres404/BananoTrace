import { ActivatedRouteSnapshot, DetachedRouteHandle } from '@angular/router';
import { CachedRouteReuseStrategy } from './cached-route-reuse-strategy';

function makeRoute(path: string, reuse: boolean, params: Record<string, string> = {}) {
  return {
    routeConfig: { path, data: { reuse } },
    params,
  } as unknown as ActivatedRouteSnapshot;
}

describe('CachedRouteReuseStrategy', () => {
  let strategy: CachedRouteReuseStrategy;

  beforeEach(() => {
    strategy = new CachedRouteReuseStrategy();
  });

  it('detaches and later attaches a route explicitly marked with data.reuse', () => {
    const route = makeRoute('lotes', true);
    const handle = {} as DetachedRouteHandle;

    expect(strategy.shouldDetach(route)).toBe(true);
    strategy.store(route, handle);

    expect(strategy.shouldAttach(makeRoute('lotes', true))).toBe(true);
    expect(strategy.retrieve(makeRoute('lotes', true))).toBe(handle);
  });

  it('never detaches or attaches a route without data.reuse', () => {
    const route = makeRoute('lotes/:id', false);

    expect(strategy.shouldDetach(route)).toBe(false);
    strategy.store(route, {} as DetachedRouteHandle);
    expect(strategy.shouldAttach(makeRoute('lotes/:id', false))).toBe(false);
    expect(strategy.retrieve(makeRoute('lotes/:id', false))).toBeNull();
  });

  it('forgets a stored handle when store is called with null', () => {
    const route = makeRoute('usuarios', true);
    strategy.store(route, {} as DetachedRouteHandle);
    expect(strategy.shouldAttach(makeRoute('usuarios', true))).toBe(true);

    strategy.store(route, null);

    expect(strategy.shouldAttach(makeRoute('usuarios', true))).toBe(false);
  });

  it('reuses a route with the same routeConfig and identical params', () => {
    const routeConfig = { path: 'lotes', data: { reuse: true } };
    const future = { routeConfig, params: {} } as unknown as ActivatedRouteSnapshot;
    const curr = { routeConfig, params: {} } as unknown as ActivatedRouteSnapshot;

    expect(strategy.shouldReuseRoute(future, curr)).toBe(true);
  });

  it('does not reuse a route when the params differ (e.g. navigating between two ids)', () => {
    const routeConfig = { path: 'lotes/:id', data: {} };
    const future = { routeConfig, params: { id: '2' } } as unknown as ActivatedRouteSnapshot;
    const curr = { routeConfig, params: { id: '1' } } as unknown as ActivatedRouteSnapshot;

    expect(strategy.shouldReuseRoute(future, curr)).toBe(false);
  });
});
