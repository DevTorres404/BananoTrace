import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type TipoQr = 'corporativo' | 'publico';

export interface QrResult {
  url: string;
  qrDataUri: string;
  tipo: TipoQr;
  codigo: string;
}

@Injectable({ providedIn: 'root' })
export class QrService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/qr';

  generar(idLote: string, tipo: TipoQr): Observable<QrResult> {
    return this.http.get<QrResult>(`${this.apiUrl}/lotes/${idLote}`, {
      params: { tipo },
    });
  }
}
