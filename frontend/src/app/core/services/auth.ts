import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, Observable, share, tap, throwError } from 'rxjs';
import { decodeJwtPayload, JwtPayload } from '../auth/jwt-payload';
import { RouteReuseStrategy } from '@angular/router';
import { CachedRouteReuseStrategy } from '../routing/cached-route-reuse-strategy';

export interface AuthenticatedUser {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  idRol: number;
  rol: string;
  idProductor: string | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: AuthenticatedUser;
}

const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly routeReuseStrategy = inject(RouteReuseStrategy) as CachedRouteReuseStrategy;
  private readonly token = signal(this.readStored(TOKEN_KEY));
  private refreshInFlight: Observable<LoginResponse> | null = null;

  readonly isAuthenticated = computed(() => decodeJwtPayload(this.token()) !== null);
  readonly currentUser = computed<JwtPayload | null>(() => decodeJwtPayload(this.token()));

  login(credentials: { email: string; password: string }): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('/api/auth/login', credentials)
      .pipe(tap((response) => this.persistSession(response)));
  }

  register(data: Record<string, unknown>): Observable<unknown> {
    return this.http.post('/api/auth/register', data);
  }

  /**
   * Pide un access token nuevo con el refresh token guardado. Comparte una única llamada
   * en curso entre requests concurrentes (varias peticiones vencidas a la vez no deben
   * disparar refrescos en paralelo).
   */
  refreshAccessToken(): Observable<LoginResponse> {
    if (this.refreshInFlight) return this.refreshInFlight;

    const refreshToken = this.readStored(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      this.logout();
      return throwError(() => new Error('No hay un token de actualización disponible'));
    }

    this.refreshInFlight = this.http
      .post<LoginResponse>('/api/auth/refresh', { refresh_token: refreshToken })
      .pipe(
        tap((response) => this.persistSession(response)),
        catchError((error) => {
          this.logout();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        share(),
      );
    return this.refreshInFlight;
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    this.token.set(null);
    this.routeReuseStrategy.clear();
    void this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.token();
  }

  getRefreshToken(): string | null {
    return this.readStored(REFRESH_TOKEN_KEY);
  }

  private persistSession(response: LoginResponse): void {
    localStorage.setItem(TOKEN_KEY, response.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
    this.token.set(response.access_token);
  }

  private readStored(key: string): string | null {
    return typeof window === 'undefined' ? null : localStorage.getItem(key);
  }
}
