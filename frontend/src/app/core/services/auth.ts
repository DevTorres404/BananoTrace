import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { decodeJwtPayload, JwtPayload } from '../auth/jwt-payload';

export interface AuthenticatedUser {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  idRol: number;
  rol: string;
}

export interface LoginResponse {
  access_token: string;
  user: AuthenticatedUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly token = signal(this.readStoredToken());

  readonly isAuthenticated = computed(() => decodeJwtPayload(this.token()) !== null);
  readonly currentUser = computed<JwtPayload | null>(() => decodeJwtPayload(this.token()));

  login(credentials: { email: string; password: string }): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', credentials).pipe(
      tap((response) => {
        localStorage.setItem('token', response.access_token);
        this.token.set(response.access_token);
      }),
    );
  }

  register(data: Record<string, unknown>): Observable<unknown> {
    return this.http.post('/api/auth/register', data);
  }

  logout(): void {
    localStorage.removeItem('token');
    this.token.set(null);
    void this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.token();
  }

  private readStoredToken(): string | null {
    return typeof window === 'undefined' ? null : localStorage.getItem('token');
  }
}
