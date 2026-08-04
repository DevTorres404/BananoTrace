import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

// ── Response shapes (matching backend AnalyticsService) ─────────────────────

export interface ProduccionKpis {
  totalLotes: number;
  totalPlantas: number;
  totalKg: number;
  diasCicloProm: number;
}

export interface ProduccionResponse {
  kpis: ProduccionKpis;
  porEstado: { estado: string; cantidad: number }[];
  porVariedad: { variedad: string; cantidad: number; pesoKg: number }[];
  tendencia: { anio: number; mes: number; lotes: number; kg: number }[];
  topFincas: { finca: string; pais: string; lotes: number; kg: number }[];
}

export interface CalidadKpis {
  totalControles: number;
  aprobados: number;
  observados: number;
  rechazados: number;
  tasaAprobacion: number;
  pctRechazoProm: string;
  calibreProm: string;
}

export interface CalidadResponse {
  kpis: CalidadKpis;
  porResultado: { resultado: string; cantidad: number }[];
  tendenciaRechazo: { anio: number; mes: number; pctRechazo: string; controles: number }[];
  porVariedad: { variedad: string; calibreProm: string; cantidad: number }[];
  topRechazadas: { finca: string; pais: string; pctRechazo: string; rechazados: number; total: number }[];
}

export interface LogisticaKpis {
  totalEnvios: number;
  totalCajas: number;
  totalKg: number;
  tempProm: string;
  diasTransitoProm: number;
}

export interface LogisticaResponse {
  kpis: LogisticaKpis;
  porEstado: { estado: string; cantidad: number }[];
  porNaviera: { naviera: string; envios: number; kg: number }[];
  rutas: { origen: string; destino: string; envios: number; kg: number }[];
  tendencia: { anio: number; mes: number; envios: number; kg: number }[];
}

export interface ResumenResponse {
  produccion: { totalLotes: number; totalKg: number; lotesActivos: number };
  calidad: { aprobados: number; rechazados: number; pctRechazo: string };
  logistica: { totalEnvios: number; entregados: number; totalKg: number };
  actividadReciente: { anio: number; mes: number; lotes: number; kgCosechado: number; envios: number }[];
}

export interface EtlRefreshResult {
  durationMs: number;
  views: { name: string; rowCount: number }[];
}

export interface AnalyticsFilters {
  desde?: string;
  hasta?: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/analytics';

  private buildParams(filters: AnalyticsFilters): HttpParams {
    let params = new HttpParams();
    if (filters.desde) params = params.set('desde', filters.desde);
    if (filters.hasta) params = params.set('hasta', filters.hasta);
    return params;
  }

  resumen(filters: AnalyticsFilters = {}): Observable<ResumenResponse> {
    return this.http.get<ResumenResponse>(`${this.base}/resumen`, { params: this.buildParams(filters) });
  }

  produccion(filters: AnalyticsFilters = {}): Observable<ProduccionResponse> {
    return this.http.get<ProduccionResponse>(`${this.base}/produccion`, { params: this.buildParams(filters) });
  }

  calidad(filters: AnalyticsFilters = {}): Observable<CalidadResponse> {
    return this.http.get<CalidadResponse>(`${this.base}/calidad`, { params: this.buildParams(filters) });
  }

  logistica(filters: AnalyticsFilters = {}): Observable<LogisticaResponse> {
    return this.http.get<LogisticaResponse>(`${this.base}/logistica`, { params: this.buildParams(filters) });
  }

  etlRefresh(): Observable<EtlRefreshResult> {
    return this.http.post<EtlRefreshResult>(`${this.base}/etl/refresh`, {});
  }
}
