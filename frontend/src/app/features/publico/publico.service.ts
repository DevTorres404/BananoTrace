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

export interface ConsultaResultado {
  tipo: 'LOTE' | 'EMPAQUE' | 'ENVIO';
  codigo: string;
  estado: string | null;
  finca: { nombre: string; pais: string; region: string } | null;
  fechaSiembra: string | null;
  fechaCosecha: string | null;
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
