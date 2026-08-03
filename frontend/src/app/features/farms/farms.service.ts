import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface FarmProducer {
  idProductor: string;
  identificacion?: string;
  nombreRazonSocial: string;
}

export interface Farm {
  idFinca: string;
  idProductor: string;
  codigoFinca: string;
  nombre: string;
  pais: string;
  region: string;
  localidad: string;
  sublocalidad: string | null;
  latitud: string | null;
  longitud: string | null;
  areaHectareas: string | null;
  estado: boolean;
  fechaActualizacion: string | null;
  productor: FarmProducer;
  lotesActivos: number;
  totalCertificaciones: number;
}

export interface FarmPayload {
  idProductor?: string;
  nombre: string;
  pais: string;
  region: string;
  localidad: string;
  sublocalidad?: string;
  latitud?: string | null;
  longitud?: string | null;
  areaHectareas?: string | null;
  estado?: boolean;
}

export interface FarmFilters {
  q?: string;
  pais?: string;
  region?: string;
  localidad?: string;
  idProductor?: string;
  estado?: '' | 'true' | 'false';
  page?: number;
  pageSize?: number;
}

export interface FarmPage {
  data: Farm[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface FarmDashboard {
  totalFincasActivas: number;
  totalLotesActivos: number;
  totalCertificaciones: number;
  fincas: Array<{
    idFinca: string;
    codigoFinca: string;
    nombre: string;
    productor: FarmProducer;
    lotesActivos: number;
  }>;
}

export interface Certification {
  idCertificacion: string;
  idFinca: string;
  tipoCertificacion: string;
  entidadEmisora: string;
  tipoCertificacionCodigo: string;
  entidadEmisoraCodigo: string;
  numeroCertificado: string;
  fechaEmision: string;
  fechaVencimiento: string | null;
  documentoUrl: string | null;
  estado: 'VIGENTE' | 'VENCIDA' | 'SIN_VENCIMIENTO';
  finca: {
    idFinca: string;
    codigoFinca: string;
    nombre: string;
    productor: FarmProducer;
  };
}

export interface CatalogOption {
  codigo: string;
  nombre: string;
}

export interface CertificationPage {
  data: Certification[];
  summary: { total: number; validCount: number; expiredCount: number };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CertificationOptions {
  types: Array<CatalogOption & { idTipoCertificacion: number }>;
  issuers: Array<CatalogOption & { idEntidadCertificadora: number; alcance: string | null }>;
}

export interface CertificationPayload {
  tipoCertificacion: string;
  entidadEmisora: string;
  numeroCertificado: string;
  fechaEmision: string;
  fechaVencimiento?: string | null;
  documentoUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class FarmsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/farms';

  getFarms(filters: FarmFilters = {}): Observable<FarmPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<FarmPage>(this.apiUrl, { params });
  }

  getFarm(id: string): Observable<Farm> {
    return this.http.get<Farm>(`${this.apiUrl}/${id}`);
  }

  getDashboard(): Observable<FarmDashboard> {
    return this.http.get<FarmDashboard>(`${this.apiUrl}/dashboard`);
  }

  createFarm(payload: FarmPayload): Observable<Farm> {
    return this.http.post<Farm>(this.apiUrl, payload);
  }

  updateFarm(id: string, payload: Partial<FarmPayload>): Observable<Farm> {
    return this.http.patch<Farm>(`${this.apiUrl}/${id}`, payload);
  }

  deactivateFarm(id: string): Observable<Farm> {
    return this.http.delete<Farm>(`${this.apiUrl}/${id}`);
  }

  getCertifications(
    filters: { farmId?: string; page?: number; pageSize?: number; status?: string; q?: string } = {},
  ): Observable<CertificationPage> {
    let params = new HttpParams();
    if (filters.farmId) params = params.set('farmId', filters.farmId);
    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.pageSize) params = params.set('pageSize', String(filters.pageSize));
    if (filters.status) params = params.set('status', filters.status);
    if (filters.q) params = params.set('q', filters.q);
    return this.http.get<CertificationPage>(`${this.apiUrl}/certifications`, { params });
  }

  getCertificationOptions(): Observable<CertificationOptions> {
    return this.http.get<CertificationOptions>(`${this.apiUrl}/certification-options`);
  }

  createCertification(farmId: string, payload: CertificationPayload) {
    return this.http.post<Certification>(`${this.apiUrl}/${farmId}/certifications`, payload);
  }

  updateCertification(
    farmId: string,
    certificationId: string,
    payload: Partial<CertificationPayload>,
  ) {
    return this.http.patch<Certification>(
      `${this.apiUrl}/${farmId}/certifications/${certificationId}`,
      payload,
    );
  }

  deleteCertification(farmId: string, certificationId: string) {
    return this.http.delete<{ deleted: boolean }>(
      `${this.apiUrl}/${farmId}/certifications/${certificationId}`,
    );
  }
}
