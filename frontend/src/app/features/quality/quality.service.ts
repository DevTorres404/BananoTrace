import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type QualityResult = 'APROBADO' | 'OBSERVADO' | 'RECHAZADO';

export interface QualityControl {
  idControl: string;
  idEjecucion: string;
  idLote: string;
  codigoLote: string;
  fechaControl: string;
  categoriaCalidad: string | null;
  categoriaCalidadCodigo: string | null;
  calibreMm: number | null;
  pesoMuestraKg: number | null;
  porcentajeRechazo: number | null;
  resultado: QualityResult;
  observaciones: string | null;
  inspector: string;
}

export interface QualityCategory {
  idCategoriaCalidad: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

export interface QualityControlPayload {
  idEjecucion: string;
  idLote: string;
  categoriaCalidad?: string;
  calibreMm?: number | null;
  pesoMuestraKg?: number | null;
  pesoRechazadoKg?: number | null;
  resultado: QualityResult;
  observaciones?: string;
}

export interface QualitySummary {
  total: number;
  approved: number;
  observed: number;
  rejected: number;
  avgRejectionPct: number | null;
}

export interface LotQualityStatus {
  hasControls: boolean;
  lastResult: QualityResult | null;
  lastControlDate: string | null;
  isBlocked: boolean;
  blockReason: string | null;
}

export interface QualityPageResult {
  data: QualityControl[];
  summary: QualitySummary;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class QualityService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/quality';

  createControl(payload: QualityControlPayload): Observable<QualityControl> {
    return this.http.post<QualityControl>(this.apiUrl, payload);
  }

  getCategories(): Observable<QualityCategory[]> {
    return this.http.get<QualityCategory[]>(`${this.apiUrl}/categories`);
  }

  getControls(
    filters: { resultado?: QualityResult; search?: string; page?: number; pageSize?: number } = {},
  ): Observable<QualityPageResult> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) params = params.set(key, value);
    }
    return this.http.get<QualityPageResult>(this.apiUrl, { params });
  }

  getControlsByLot(
    lotId: string,
    resultado?: QualityResult,
  ): Observable<{ data: QualityControl[]; summary: QualitySummary }> {
    let params = new HttpParams();
    if (resultado) params = params.set('resultado', resultado);
    return this.http.get<{ data: QualityControl[]; summary: QualitySummary }>(
      `${this.apiUrl}/lots/${lotId}`,
      { params },
    );
  }

  getLotStatus(lotId: string): Observable<LotQualityStatus> {
    return this.http.get<LotQualityStatus>(`${this.apiUrl}/lots/${lotId}/status`);
  }

  getControl(id: string): Observable<QualityControl> {
    return this.http.get<QualityControl>(`${this.apiUrl}/${id}`);
  }
}

export const QUALITY_RESULT_LABELS: Record<QualityResult, string> = {
  APROBADO: 'Aprobado',
  OBSERVADO: 'Observado',
  RECHAZADO: 'Rechazado',
};

export const QUALITY_RESULT_COLORS: Record<QualityResult, string> = {
  APROBADO: 'var(--color-success, #22c55e)',
  OBSERVADO: 'var(--color-warning, #f59e0b)',
  RECHAZADO: 'var(--color-error, #ef4444)',
};
