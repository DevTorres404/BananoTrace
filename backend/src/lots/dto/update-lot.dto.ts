import type { EstadoLote } from '@prisma/client';

export interface UpdateLotDto {
  variedad?: string;
  fechaSiembra?: string | null;
  fechaEstimadaCosecha?: string | null;
  fechaCosecha?: string | null;
  cantidadPlantas?: string | number | null;
  pesoCosechadoKg?: string | number | null;
  estado?: EstadoLote;
}
