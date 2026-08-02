export interface CreateFarmDto {
  idProductor?: string | number;
  nombre: string;
  pais: string;
  region: string;
  localidad: string;
  sublocalidad?: string;
  latitud?: string | number | null;
  longitud?: string | number | null;
  areaHectareas?: string | number | null;
  estado?: boolean;
}
