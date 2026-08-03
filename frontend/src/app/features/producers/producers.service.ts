import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface LinkedProducerUser {
  idUsuario: string;
  nombres: string;
  apellidos: string;
  correo: string;
  estado: boolean;
}

export interface AssignableProducerUser extends LinkedProducerUser {
  idProductor: string | null;
}

export interface Producer {
  idProductor: string;
  identificacion: string;
  nombreRazonSocial: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  fechaActualizacion: string | null;
  totalFincas: number;
  totalUsuarios: number;
  usuarios: LinkedProducerUser[];
}

export interface ProducerPayload {
  identificacion: string;
  nombreRazonSocial: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
  idUsuarios?: string[];
}

export interface ProducerFilters {
  q?: string;
  vinculado?: '' | 'true' | 'false';
  page?: number;
  pageSize?: number;
}

export interface ProducerPage {
  data: Producer[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class ProducersService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/producers';

  getProducers(filters: ProducerFilters = {}): Observable<ProducerPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<ProducerPage>(this.apiUrl, { params });
  }

  getProducer(id: string): Observable<Producer> {
    return this.http.get<Producer>(`${this.apiUrl}/${id}`);
  }

  getAssignableUsers(producerId?: string): Observable<AssignableProducerUser[]> {
    const query = producerId ? `?producerId=${encodeURIComponent(producerId)}` : '';
    return this.http.get<AssignableProducerUser[]>(`${this.apiUrl}/assignable-users${query}`);
  }

  createProducer(payload: ProducerPayload): Observable<Producer> {
    return this.http.post<Producer>(this.apiUrl, payload);
  }

  updateProducer(id: string, payload: Partial<ProducerPayload>): Observable<Producer> {
    return this.http.patch<Producer>(`${this.apiUrl}/${id}`, payload);
  }

  deleteProducer(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.apiUrl}/${id}`);
  }
}
