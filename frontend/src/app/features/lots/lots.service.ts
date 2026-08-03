import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type LotState =
  'PLANIFICADO' | 'EN_PRODUCCION' | 'COSECHADO' | 'EMPACADO' | 'EXPORTADO' | 'CERRADO';

export interface LotFarmOption {
  idFinca: string;
  codigoFinca: string;
  nombre: string;
}

export interface LotVarietyOption {
  idVariedad: number;
  codigo: string;
  nombre: string;
}

export interface Lot {
  idLote: string;
  idUnidad: string;
  idFinca: string;
  codigoLote: string;
  variedad: string | null;
  variedadNombre: string | null;
  fechaSiembra: string | null;
  fechaEstimadaCosecha: string | null;
  fechaCosecha: string | null;
  cantidadPlantas: number | null;
  pesoCosechadoKg: string | null;
  estado: LotState;
  fechaRegistro: string;
  fechaActualizacion: string | null;
  finca: {
    idFinca: string;
    codigoFinca: string;
    nombre: string;
    pais: string;
    region: string;
    localidad: string;
    productor: { idProductor: string; nombreRazonSocial: string };
  };
}

export interface LotPhase {
  idEjecucion: string;
  fase: {
    codigo: string;
    nombre: string;
    orden: number;
    requiereAprobacion: boolean;
    idRolResponsable: number | null;
  };
  estado: string;
  numeroIntento: number;
  fechaInicio: string | null;
  fechaFin: string | null;
  responsable: string | null;
  transiciones: Array<{
    idTransicion: string;
    estadoAnterior: string | null;
    estadoNuevo: string;
    comentario: string | null;
    fechaTransicion: string;
    usuario: string;
  }>;
}

export interface LotDetail extends Lot {
  timeline: Array<{
    idEvento: string;
    fecha: string;
    tipo: string;
    descripcion: string | null;
    ubicacion: string | null;
    usuario: string;
  }>;
  flujo: null | {
    idInstancia: string;
    codigo: string;
    estado: string;
    fechaInicio: string | null;
    fechaFin: string | null;
    definicion: { codigo: string; nombre: string; version: number };
    faseActual: null | {
      idEjecucion: string;
      codigo: string;
      nombre: string;
      estado: string;
      requiereAprobacion: boolean;
      idRolResponsable: number | null;
    };
    fases: LotPhase[];
  };
}

export interface LotPayload {
  idFinca: string;
  variedad: string;
  fechaSiembra?: string | null;
  fechaEstimadaCosecha?: string | null;
  cantidadPlantas?: number | string | null;
  fechaCosecha?: string | null;
  pesoCosechadoKg?: number | string | null;
  estado?: LotState;
}

export interface LotFilters {
  q?: string;
  idFinca?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  pageSize?: number;
}

export interface LotPage {
  data: Lot[];
  summary: { totalLots: number; activeLots: number; totalPlants: number };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class LotsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/lots';

  getLots(filters: LotFilters): Observable<LotPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<LotPage>(this.apiUrl, { params });
  }

  getOptions(): Observable<{
    states: LotState[];
    farms: LotFarmOption[];
    varieties: LotVarietyOption[];
  }> {
    return this.http.get<{
      states: LotState[];
      farms: LotFarmOption[];
      varieties: LotVarietyOption[];
    }>(`${this.apiUrl}/options`);
  }

  getLot(id: string): Observable<LotDetail> {
    return this.http.get<LotDetail>(`${this.apiUrl}/${id}`);
  }

  createLot(payload: LotPayload): Observable<LotDetail> {
    return this.http.post<LotDetail>(this.apiUrl, payload);
  }

  updateLot(id: string, payload: Partial<LotPayload>): Observable<LotDetail> {
    return this.http.patch<LotDetail>(`${this.apiUrl}/${id}`, payload);
  }

  advanceLot(id: string, comentario?: string): Observable<LotDetail> {
    return this.http.post<LotDetail>(`${this.apiUrl}/${id}/advance`, { comentario });
  }
}

export const LOT_STATE_LABELS: Record<LotState, string> = {
  PLANIFICADO: 'Planificado',
  EN_PRODUCCION: 'En producción',
  COSECHADO: 'Cosechado',
  EMPACADO: 'Empacado',
  EXPORTADO: 'Exportado',
  CERRADO: 'Cerrado',
};
