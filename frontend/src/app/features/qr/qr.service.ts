import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface QrResult {
  url: string;
  qrDataUri: string;
  codigo: string;
}

@Injectable({ providedIn: 'root' })
export class QrService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/qr';

  generar(idLote: string): Observable<QrResult> {
    return this.http.get<QrResult>(`${this.apiUrl}/lotes/${idLote}`);
  }
}
