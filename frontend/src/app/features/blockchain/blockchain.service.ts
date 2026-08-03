import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type EstadoConfirmacionBlockchain = 'PENDIENTE' | 'CONFIRMADO' | 'ERROR';

export interface BlockchainBlock {
  idRegistroBlockchain: string;
  idInstancia: string;
  idTransicion: string;
  indice: number;
  hashDatos: string;
  hashAnterior: string | null;
  algoritmo: string;
  fechaRegistro: string;
  estadoConfirmacion: EstadoConfirmacionBlockchain;
}

export interface ChainError {
  indice: number;
  motivo: string;
}

export interface ChainVerification {
  integra: boolean;
  bloques: number;
  errores: ChainError[];
}

@Injectable({ providedIn: 'root' })
export class BlockchainService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/blockchain';

  getChain(idInstancia: string): Observable<BlockchainBlock[]> {
    return this.http.get<BlockchainBlock[]>(`${this.apiUrl}/instancias/${idInstancia}`);
  }

  verifyChain(idInstancia: string): Observable<ChainVerification> {
    return this.http.get<ChainVerification>(
      `${this.apiUrl}/instancias/${idInstancia}/verificar`,
    );
  }
}
