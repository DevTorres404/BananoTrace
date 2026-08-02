CREATE TABLE "codigo_correlativos" (
  "entidad" VARCHAR(30) NOT NULL,
  "anio" SMALLINT NOT NULL,
  "ultimo" INTEGER NOT NULL,
  CONSTRAINT "codigo_correlativos_pkey" PRIMARY KEY ("entidad", "anio"),
  CONSTRAINT "codigo_correlativos_ultimo_check" CHECK ("ultimo" > 0)
);

CREATE OR REPLACE FUNCTION "siguiente_codigo_trazabilidad"(
  p_entidad VARCHAR,
  p_prefijo VARCHAR
) RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
  v_anio SMALLINT := EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT;
  v_numero INTEGER;
BEGIN
  INSERT INTO "codigo_correlativos" ("entidad", "anio", "ultimo")
  VALUES (p_entidad, v_anio, 1)
  ON CONFLICT ("entidad", "anio")
  DO UPDATE SET "ultimo" = "codigo_correlativos"."ultimo" + 1
  RETURNING "ultimo" INTO v_numero;

  RETURN p_prefijo || '-' || v_anio::TEXT || '-' || LPAD(v_numero::TEXT, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION "asignar_codigo_automatico"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'fincas' AND (NEW."codigo_finca" IS NULL OR BTRIM(NEW."codigo_finca") = '') THEN
    NEW."codigo_finca" := "siguiente_codigo_trazabilidad"('FINCA', 'FIN');
  ELSIF TG_TABLE_NAME = 'lotes_produccion' AND (NEW."codigo_lote" IS NULL OR BTRIM(NEW."codigo_lote") = '') THEN
    NEW."codigo_lote" := "siguiente_codigo_trazabilidad"('LOTE', 'BAN');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_codigo_finca"
BEFORE INSERT OR UPDATE OF "codigo_finca" ON "fincas"
FOR EACH ROW EXECUTE FUNCTION "asignar_codigo_automatico"();

CREATE TRIGGER "trg_codigo_lote"
BEFORE INSERT OR UPDATE OF "codigo_lote" ON "lotes_produccion"
FOR EACH ROW EXECUTE FUNCTION "asignar_codigo_automatico"();

ALTER TABLE "fincas" RENAME COLUMN "provincia" TO "region";
ALTER TABLE "fincas" RENAME COLUMN "canton" TO "localidad";
ALTER TABLE "fincas" RENAME COLUMN "parroquia" TO "sublocalidad";
ALTER TABLE "fincas" ADD COLUMN "pais" VARCHAR(80);
UPDATE "fincas" SET "pais" = 'Ecuador' WHERE "pais" IS NULL;
ALTER TABLE "fincas" ALTER COLUMN "pais" SET NOT NULL;
ALTER TABLE "fincas" ALTER COLUMN "region" TYPE VARCHAR(100);
ALTER TABLE "fincas" ALTER COLUMN "localidad" TYPE VARCHAR(100);
ALTER TABLE "fincas" ALTER COLUMN "sublocalidad" TYPE VARCHAR(100);

ALTER TABLE "fases" ADD COLUMN "estado_lote_inicio" "estado_lote";
ALTER TABLE "fases" ADD COLUMN "estado_lote_fin" "estado_lote";
