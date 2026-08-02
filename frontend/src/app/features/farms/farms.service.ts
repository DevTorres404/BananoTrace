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
  search?: string;
  pais?: string;
  region?: string;
  localidad?: string;
  idProductor?: string;
  estado?: '' | 'true' | 'false';
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

  getFarms(filters: FarmFilters = {}): Observable<Farm[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params = params.set(key, value);
    }
    return this.http.get<Farm[]>(this.apiUrl, { params });
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

  getCertifications(farmId?: string): Observable<Certification[]> {
    const params = farmId ? new HttpParams().set('farmId', farmId) : undefined;
    return this.http.get<Certification[]>(`${this.apiUrl}/certifications`, { params });
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
