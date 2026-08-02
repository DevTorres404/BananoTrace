export interface CreateEnvioDto {
  numeroContenedor?: string;
  naviera?: string;
  puertoOrigen: string;
  puertoDestino: string;
  fechaEstimadaLlegada?: string;
  temperaturaSalida?: number | string;
}
