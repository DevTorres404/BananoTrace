import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface UserRole {
  idRol: number;
  nombre: string;
  descripcion: string | null;
}

export interface UserAccount {
  idUsuario: string;
  nombres: string;
  apellidos: string;
  correo: string;
  idProductor: string | null;
  productor: {
    idProductor: string;
    identificacion: string;
    nombreRazonSocial: string;
  } | null;
  estado: boolean;
  fechaCreacion: string;
  fechaActualizacion: string | null;
  rol: UserRole;
}

export interface UserPayload {
  nombres: string;
  apellidos: string;
  correo: string;
  idRol: number;
  idProductor?: string | null;
  clave?: string;
}

export interface UserFilters {
  q?: string;
  idRol?: number | string;
  estado?: '' | 'true' | 'false';
  page?: number;
  pageSize?: number;
}

export interface UserPage {
  data: UserAccount[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/users';

  getUsers(filters: UserFilters = {}): Observable<UserPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<UserPage>(this.apiUrl, { params });
  }

  getUser(id: string): Observable<UserAccount> {
    return this.http.get<UserAccount>(`${this.apiUrl}/${id}`);
  }

  getRoles(): Observable<UserRole[]> {
    return this.http.get<UserRole[]>(`${this.apiUrl}/roles`);
  }

  createUser(payload: UserPayload): Observable<UserAccount> {
    return this.http.post<UserAccount>(this.apiUrl, payload);
  }

  updateUser(id: string, payload: Partial<UserPayload>): Observable<UserAccount> {
    return this.http.patch<UserAccount>(`${this.apiUrl}/${id}`, payload);
  }

  setStatus(id: string, estado: boolean): Observable<UserAccount> {
    return this.http.patch<UserAccount>(`${this.apiUrl}/${id}/status`, { estado });
  }
}
