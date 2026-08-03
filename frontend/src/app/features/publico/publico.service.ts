import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface ConsultaTimelineItem {
  fase: string;
  fecha: string | null;
  estado: string;
}

export interface ConsultaIntegridad {
  verificable: boolean;
  integra: boolean | null;
  bloques: number;
}

export interface ConsultaFinca {
  nombre: string;
  pais: string;
  region: string;
  localidad: string | null;
  areaHectareas: string | null;
}

export interface ConsultaProducto {
  variedad: string | null;
  descripcion: string | null;
}

export interface ConsultaProductor {
  nombreRazonSocial: string | null;
  identificacion: string | null;
}

export interface ConsultaCertificacion {
  tipo: string | null;
  entidad: string | null;
  numero: string;
  fechaVencimiento: string | null;
}

export interface ConsultaFechas {
  siembra: string | null;
  cosecha: string | null;
  empaque: string | null;
  salida: string | null;
  llegadaEstimada: string | null;
}

export interface ConsultaEnvio {
  temperaturaSalida: string | null;
  estado: string | null;
  naviera: string | null;
  puertoOrigen: string | null;
  puertoDestino: string | null;
}

export interface ConsultaResultado {
  tipo: 'LOTE' | 'EMPAQUE' | 'ENVIO';
  codigo: string;
  estado: string | null;
  finca: ConsultaFinca | null;
  producto: ConsultaProducto;
  productor: ConsultaProductor | null;
  pesoNetoKg: string | null;
  fechaSiembra: string | null;
  fechaCosecha: string | null;
  fechas: ConsultaFechas;
  certificaciones: ConsultaCertificacion[];
  envio: ConsultaEnvio | null;
  timeline: ConsultaTimelineItem[];
  integridadBlockchain: ConsultaIntegridad;
}

@Injectable({ providedIn: 'root' })
export class PublicoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/publico';

  consultar(codigo: string): Observable<ConsultaResultado> {
    return this.http.get<ConsultaResultado>(`${this.apiUrl}/consulta`, {
      params: { codigo },
    });
  }
}
