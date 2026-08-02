export interface CreateProducerDto {
  identificacion: string;
  nombreRazonSocial: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
  idUsuarios?: Array<string | number>;
}
