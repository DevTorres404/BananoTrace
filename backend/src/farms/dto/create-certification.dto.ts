export interface CreateCertificationDto {
  tipoCertificacion: string;
  entidadEmisora: string;
  numeroCertificado: string;
  fechaEmision: string;
  fechaVencimiento?: string | null;
  documentoUrl?: string | null;
}
