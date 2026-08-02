import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface EventType {
  idTipoEvento: number;
  nombre: string;
  descripcion: string | null;
}

export interface TraceabilityDocument {
  idDocumento: string;
  nombre: string;
  tipo: string;
  tipoCodigo: string;
  url: string;
  fechaCarga: string;
}

export interface DocumentType {
  idTipoDocumento: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

export interface TraceabilityEvent {
  idEvento: string;
  idUnidad: string;
  idEjecucion: string;
  idUsuario: string;
  tipoEvento: { id: number; nombre: string; descripcion: string | null };
  fechaEvento: string;
  ubicacion: string | null;
  descripcion: string | null;
  datosAdicionales: Record<string, unknown>;
  fechaRegistro: string;
  usuario: string;
  documentos: TraceabilityDocument[];
  unidad: {
    codigo: string;
    tipo: string;
    referencia: string;
    idLote: string | null;
    finca: string | null;
  };
  fase: { codigo: string; nombre: string };
}

export interface CreateEventPayload {
  idUnidad: string;
  idEjecucion: string;
  idTipoEvento: number;
  fechaEvento: string;
  ubicacion?: string;
  descripcion?: string;
  datosAdicionales?: Record<string, unknown>;
}

export interface CreateDocumentPayload {
  nombre: string;
  tipo: string;
  url: string;
}

export interface EventFilters {
  idTipoEvento?: number;
  idUsuario?: string;
  desde?: string;
  hasta?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TraceabilityOptions {
  eventTypes: EventType[];
  documentTypes: DocumentType[];
  users: Array<{ idUsuario: string; nombre: string }>;
}

export interface TraceabilityPage {
  data: TraceabilityEvent[];
  summary: { total: number; units: number; documents: number };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class TraceabilityService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/traceability';

  getEventTypes(): Observable<EventType[]> {
    return this.http.get<EventType[]>(`${this.apiUrl}/event-types`);
  }

  getDocumentTypes(): Observable<DocumentType[]> {
    return this.http.get<DocumentType[]>(`${this.apiUrl}/document-types`);
  }

  getOptions(): Observable<TraceabilityOptions> {
    return this.http.get<TraceabilityOptions>(`${this.apiUrl}/options`);
  }

  getEvents(filters: EventFilters = {}): Observable<TraceabilityPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<TraceabilityPage>(`${this.apiUrl}/events`, { params });
  }

  getTimeline(idUnidad: string, filters?: EventFilters): Observable<TraceabilityEvent[]> {
    let params = new HttpParams();
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') params = params.set(key, String(value));
      }
    }
    return this.http.get<TraceabilityEvent[]>(`${this.apiUrl}/units/${idUnidad}/timeline`, {
      params,
    });
  }

  getEvent(id: string): Observable<TraceabilityEvent> {
    return this.http.get<TraceabilityEvent>(`${this.apiUrl}/events/${id}`);
  }

  createEvent(payload: CreateEventPayload): Observable<TraceabilityEvent> {
    return this.http.post<TraceabilityEvent>(`${this.apiUrl}/events`, payload);
  }

  addDocument(eventId: string, payload: CreateDocumentPayload): Observable<TraceabilityDocument> {
    return this.http.post<TraceabilityDocument>(
      `${this.apiUrl}/events/${eventId}/documents`,
      payload,
    );
  }
}

export const EVENT_TYPE_ICONS: Record<string, string> = {
  SIEMBRA: '🌱',
  RIEGO: '💧',
  FERTILIZACION: '🌿',
  FUMIGACION: '🧪',
  INSPECCION_CAMPO: '🔍',
  COSECHA: '🍌',
  RECEPCION: '📦',
  EMPACADO: '📦',
  CONTROL_CALIDAD: '✅',
  TRANSPORTE: '🚛',
  EXPORTACION: '🚢',
};
