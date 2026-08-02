export interface CreateLotDto {
  idFinca: string | number;
  variedad?: string;
  fechaSiembra?: string | null;
  fechaEstimadaCosecha?: string | null;
  cantidadPlantas?: string | number | null;
}
