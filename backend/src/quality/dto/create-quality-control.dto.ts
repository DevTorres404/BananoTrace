export interface CreateQualityControlDto {
  idEjecucion: string;
  idLote: string;
  categoriaCalidad?: string;
  calibreMm?: number | string | null;
  pesoMuestraKg?: number | string | null;
  pesoRechazadoKg?: number | string | null;
  resultado: 'APROBADO' | 'OBSERVADO' | 'RECHAZADO';
  observaciones?: string;
}
