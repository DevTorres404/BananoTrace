export interface CreateEventDto {
  idUnidad: string;
  idEjecucion: string;
  idTipoEvento: number;
  fechaEvento: string;
  ubicacion?: string;
  descripcion?: string;
  datosAdicionales?: Record<string, unknown>;
}
