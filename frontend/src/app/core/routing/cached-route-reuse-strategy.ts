import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  RouteReuseStrategy,
} from '@angular/router';

/**
 * Mantiene vivas (sin destruir) las instancias de componente de las rutas marcadas con
 * `data: { reuse: true }` en app.routes.ts, para que volver a una sección ya visitada la
 * muestre al instante en vez de recrearla y volver a pedir los datos al backend.
 *
 * Los datos mostrados quedan "congelados" al último estado visto de esa sección hasta que
 * el usuario los refresca ahí mismo (filtro, paginación, guardar un formulario, etc.) o
 * recarga la página — es el trade-off esperado de cachear rutas, no un refresco en segundo
 * plano automático.
 */
@Injectable({ providedIn: 'root' })
export class CachedRouteReuseStrategy implements RouteReuseStrategy {
  private readonly handles = new Map<string, DetachedRouteHandle>();

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.cacheKey(route) !== null;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const key = this.cacheKey(route);
    if (!key) return;
    if (handle) {
      this.handles.set(key, handle);
    } else {
      this.handles.delete(key);
    }
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const key = this.cacheKey(route);
    return key !== null && this.handles.has(key);
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const key = this.cacheKey(route);
    return key ? (this.handles.get(key) ?? null) : null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return (
      future.routeConfig === curr.routeConfig &&
      JSON.stringify(future.params) === JSON.stringify(curr.params)
    );
  }

  private cacheKey(route: ActivatedRouteSnapshot): string | null {
    const path = route.routeConfig?.path;
    if (!path || route.routeConfig?.data?.['reuse'] !== true) return null;
    return path;
  }
}
