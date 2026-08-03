import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type EstadoEmpaque = 'DISPONIBLE' | 'ASIGNADO' | 'EN_TRANSITO' | 'ENTREGADO' | 'RECHAZADO';
export type EstadoEnvio = 'PLANIFICADO' | 'CARGADO' | 'EN_TRANSITO' | 'ENTREGADO' | 'CANCELADO';

export interface Empaque {
  idEmpaque: string;
  idUnidad: string;
  idEjecucion: string;
  idLote: string;
  codigoCaja: string;
  fechaEmpaque: string;
  pesoNetoKg: number;
  categoria?: string;
  categoriaCodigo?: string;
  codigoQr?: string;
  estado: EstadoEmpaque;
  lote?: { codigoLote: string };
}

export interface Envio {
  idEnvio: string;
  idUnidad: string;
  idEjecucion: string;
  codigoEnvio: string;
  numeroContenedor?: string;
  naviera?: string;
  navieraCodigo?: string;
  puertoOrigen: string;
  puertoOrigenCodigo: string;
  puertoDestino: string;
  puertoDestinoCodigo: string;
  paisDestino: string;
  paisDestinoCodigo?: string;
  fechaSalida?: string;
  fechaEstimadaLlegada?: string;
  temperaturaSalida?: number;
  estado: EstadoEnvio;
  empaques?: Empaque[];
}

export interface CreateEmpaquePayload {
  idLote: string;
  pesoNetoKg: number;
  categoria?: string;
}

export interface CreateEnvioPayload {
  numeroContenedor?: string;
  naviera?: string;
  puertoOrigen: string;
  puertoDestino: string;
  fechaEstimadaLlegada?: string;
  temperaturaSalida?: number;
}

export interface LogisticsCatalogOption {
  codigo: string;
  nombre: string;
}

export interface PortOption extends LogisticsCatalogOption {
  idPuerto: number;
  paisCodigo: string | null;
  paisNombre: string | null;
}

export interface LogisticsOptions {
  categoriasCalidad: Array<LogisticsCatalogOption & { idCategoriaCalidad: number }>;
  navieras: Array<LogisticsCatalogOption & { idNaviera: number }>;
  puertos: PortOption[];
  lotes: Array<{ idLote: string; codigoLote: string; finca: { nombre: string } }>;
}

export interface AssignEmpaquesPayload {
  empaquesIds: string[];
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface EmpaquePage extends Paginated<Empaque> {
  summary: {
    total: number;
    disponibles: number;
    asignadas: number;
    enTransito: number;
    entregadas: number;
  };
}

export interface EnvioFilters {
  q?: string;
  estado?: EstadoEnvio | '';
  page?: number;
  pageSize?: number;
}

export interface EnvioPage extends Paginated<Envio> {
  summary: {
    total: number;
    planned: number;
    loaded: number;
    inTransit: number;
    delivered: number;
  };
}

@Injectable({ providedIn: 'root' })
export class LogisticsService {
  private readonly http = inject(HttpClient);

  getOptions(): Observable<LogisticsOptions> {
    return this.http.get<LogisticsOptions>('/api/logistics/options');
  }

  // EMPAQUES
  createEmpaque(payload: CreateEmpaquePayload): Observable<Empaque> {
    return this.http.post<Empaque>('/api/logistics/empaques', payload);
  }

  getEmpaques(filters?: {
    idLote?: string;
    estado?: EstadoEmpaque;
    page?: number;
    pageSize?: number;
  }): Observable<EmpaquePage> {
    let params = new HttpParams();
    if (filters?.idLote) params = params.set('idLote', filters.idLote);
    if (filters?.estado) params = params.set('estado', filters.estado);
    if (filters?.page) params = params.set('page', filters.page);
    if (filters?.pageSize) params = params.set('pageSize', filters.pageSize);
    return this.http.get<EmpaquePage>('/api/logistics/empaques', { params });
  }

  // ENVIOS
  createEnvio(payload: CreateEnvioPayload): Observable<Envio> {
    return this.http.post<Envio>('/api/logistics/envios', payload);
  }

  getEnvios(filters: EnvioFilters = {}): Observable<EnvioPage> {
    let params = new HttpParams();
    if (filters.q?.trim()) params = params.set('q', filters.q.trim());
    if (filters.estado) params = params.set('estado', filters.estado);
    if (filters.page) params = params.set('page', filters.page.toString());
    if (filters.pageSize) params = params.set('pageSize', filters.pageSize);
    return this.http.get<EnvioPage>('/api/logistics/envios', { params });
  }

  getEnvioById(id: string): Observable<Envio> {
    return this.http.get<Envio>(`/api/logistics/envios/${id}`);
  }

  assignEmpaques(idEnvio: string, payload: AssignEmpaquesPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `/api/logistics/envios/${idEnvio}/empaques`,
      payload,
    );
  }

  advanceEmpaque(idEmpaque: string, comentario?: string): Observable<Empaque> {
    return this.http.post<Empaque>(`/api/logistics/empaques/${idEmpaque}/advance`, {
      comentario,
    });
  }

  advanceEnvio(idEnvio: string, comentario?: string): Observable<Envio> {
    return this.http.post<Envio>(`/api/logistics/envios/${idEnvio}/advance`, {
      comentario,
    });
  }
}
