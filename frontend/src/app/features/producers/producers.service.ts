import { HttpClient } from '@angular/common/http';
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

@Injectable({ providedIn: 'root' })
export class ProducersService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/producers';

  getProducers(): Observable<Producer[]> {
    return this.http.get<Producer[]>(this.apiUrl);
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
