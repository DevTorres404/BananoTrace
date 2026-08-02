export interface CreateFarmDto {
  idProductor?: string | number;
  codigoFinca: string;
  nombre: string;
  provincia: string;
  canton: string;
  parroquia?: string;
  latitud?: string | number | null;
  longitud?: string | number | null;
  areaHectareas?: string | number | null;
  estado?: boolean;
}
