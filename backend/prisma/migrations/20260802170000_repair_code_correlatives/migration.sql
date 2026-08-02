-- Repair environments where the automatic-code migration is recorded as
-- applied but its correlation table was removed or never persisted.
CREATE TABLE IF NOT EXISTS "codigo_correlativos" (
  "entidad" VARCHAR(30) NOT NULL,
  "anio" SMALLINT NOT NULL,
  "ultimo" INTEGER NOT NULL,
  CONSTRAINT "codigo_correlativos_pkey" PRIMARY KEY ("entidad", "anio"),
  CONSTRAINT "codigo_correlativos_ultimo_check" CHECK ("ultimo" > 0)
);

-- Recover each sequence from the largest code already stored. This prevents
-- the repaired generator from starting at 001 and colliding with live data.
INSERT INTO "codigo_correlativos" ("entidad", "anio", "ultimo")
SELECT
  'FINCA',
  SUBSTRING("codigo_finca" FROM '^FIN-([0-9]{4})-')::SMALLINT,
  MAX(SUBSTRING("codigo_finca" FROM '-([0-9]+)$')::INTEGER)
FROM "fincas"
WHERE "codigo_finca" ~ '^FIN-[0-9]{4}-[0-9]+$'
GROUP BY SUBSTRING("codigo_finca" FROM '^FIN-([0-9]{4})-')::SMALLINT
ON CONFLICT ("entidad", "anio") DO UPDATE
SET "ultimo" = GREATEST("codigo_correlativos"."ultimo", EXCLUDED."ultimo");

INSERT INTO "codigo_correlativos" ("entidad", "anio", "ultimo")
SELECT
  CASE "tipo"
    WHEN 'LOTE'::"tipo_unidad_trazable" THEN 'LOTE'
    WHEN 'EMPAQUE'::"tipo_unidad_trazable" THEN 'EMPAQUE'
    WHEN 'ENVIO'::"tipo_unidad_trazable" THEN 'ENVIO'
  END,
  SUBSTRING("codigo" FROM '^[A-Z]+-([0-9]{4})-')::SMALLINT,
  MAX(SUBSTRING("codigo" FROM '-([0-9]+)$')::INTEGER)
FROM "unidades_trazables"
WHERE
  ("tipo" = 'LOTE'::"tipo_unidad_trazable" AND "codigo" ~ '^BAN-[0-9]{4}-[0-9]+$')
  OR ("tipo" = 'EMPAQUE'::"tipo_unidad_trazable" AND "codigo" ~ '^CAJ-[0-9]{4}-[0-9]+$')
  OR ("tipo" = 'ENVIO'::"tipo_unidad_trazable" AND "codigo" ~ '^ENV-[0-9]{4}-[0-9]+$')
GROUP BY
  "tipo",
  SUBSTRING("codigo" FROM '^[A-Z]+-([0-9]{4})-')::SMALLINT
ON CONFLICT ("entidad", "anio") DO UPDATE
SET "ultimo" = GREATEST("codigo_correlativos"."ultimo", EXCLUDED."ultimo");

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
