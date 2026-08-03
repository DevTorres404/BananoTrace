CREATE TABLE IF NOT EXISTS "categorias_calidad" (
    "id_categoria_calidad" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "descripcion" VARCHAR(255),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "categorias_calidad_pkey" PRIMARY KEY ("id_categoria_calidad")
);

CREATE TABLE IF NOT EXISTS "tipos_certificacion" (
    "id_tipo_certificacion" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "tipos_certificacion_pkey" PRIMARY KEY ("id_tipo_certificacion")
);

CREATE TABLE IF NOT EXISTS "entidades_certificadoras" (
    "id_entidad_certificadora" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "alcance" VARCHAR(120),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "entidades_certificadoras_pkey" PRIMARY KEY ("id_entidad_certificadora")
);

CREATE TABLE IF NOT EXISTS "tipos_documento" (
    "id_tipo_documento" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "tipos_documento_pkey" PRIMARY KEY ("id_tipo_documento")
);

CREATE TABLE IF NOT EXISTS "navieras" (
    "id_naviera" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "navieras_pkey" PRIMARY KEY ("id_naviera")
);

CREATE TABLE IF NOT EXISTS "puertos" (
    "id_puerto" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "pais_codigo" CHAR(2),
    "pais_nombre" VARCHAR(80),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "puertos_pkey" PRIMARY KEY ("id_puerto")
);

CREATE UNIQUE INDEX IF NOT EXISTS "categorias_calidad_codigo_key" ON "categorias_calidad"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "tipos_certificacion_codigo_key" ON "tipos_certificacion"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "entidades_certificadoras_codigo_key" ON "entidades_certificadoras"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "tipos_documento_codigo_key" ON "tipos_documento"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "navieras_codigo_key" ON "navieras"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "puertos_codigo_key" ON "puertos"("codigo");
CREATE INDEX "puertos_pais_codigo_idx" ON "puertos"("pais_codigo");

INSERT INTO "categorias_calidad" ("codigo", "nombre", "descripcion") VALUES
('EXTRA_PREMIUM', 'Extra / Premium', 'Fruta de exportación de máxima selección'),
('PRIMERA', 'Primera', 'Fruta que cumple los criterios comerciales principales'),
('SEGUNDA', 'Segunda', 'Fruta apta con tolerancias comerciales adicionales'),
('INDUSTRIAL', 'Industrial', 'Fruta destinada a transformación o procesamiento');

INSERT INTO "tipos_certificacion" ("codigo", "nombre") VALUES
('FITOSANITARIA', 'Certificación fitosanitaria'),
('GLOBALGAP', 'GLOBALG.A.P.'),
('ORGANICA', 'Certificación orgánica'),
('GRASP', 'GRASP'),
('COMERCIO_JUSTO', 'Comercio justo'),
('RAINFOREST_ALLIANCE', 'Rainforest Alliance');

INSERT INTO "entidades_certificadoras" ("codigo", "nombre", "alcance") VALUES
('AGROCALIDAD_EC', 'Agrocalidad', 'Ecuador'),
('GLOBALGAP', 'GLOBALG.A.P.', 'Internacional'),
('USDA', 'United States Department of Agriculture', 'Estados Unidos'),
('UNION_EUROPEA', 'Unión Europea', 'Unión Europea'),
('RAINFOREST_ALLIANCE', 'Rainforest Alliance', 'Internacional'),
('FAIRTRADE', 'Fairtrade International', 'Internacional');

INSERT INTO "tipos_documento" ("codigo", "nombre") VALUES
('CERTIFICADO', 'Certificado'),
('INFORME_LABORATORIO', 'Informe de laboratorio'),
('ACTA_INSPECCION', 'Acta de inspección'),
('FACTURA', 'Factura'),
('GUIA_REMISION', 'Guía de remisión'),
('CONOCIMIENTO_EMBARQUE', 'Conocimiento de embarque'),
('OTRO', 'Otro documento');

INSERT INTO "navieras" ("codigo", "nombre") VALUES
('MSC', 'Mediterranean Shipping Company'),
('MAERSK', 'Maersk'),
('CMA_CGM', 'CMA CGM'),
('HAPAG_LLOYD', 'Hapag-Lloyd'),
('COSCO', 'COSCO Shipping'),
('ONE', 'Ocean Network Express');

INSERT INTO "puertos" ("codigo", "nombre", "pais_codigo", "pais_nombre") VALUES
('ECGYE', 'Guayaquil', 'EC', 'Ecuador'),
('ECPBO', 'Puerto Bolívar', 'EC', 'Ecuador'),
('NLRTM', 'Rotterdam', 'NL', 'Países Bajos'),
('BEANR', 'Amberes', 'BE', 'Bélgica'),
('DEHAM', 'Hamburgo', 'DE', 'Alemania'),
('USLAX', 'Los Ángeles', 'US', 'Estados Unidos'),
('CNSHA', 'Shanghái', 'CN', 'China');

-- Preserve any development data that used values outside the canonical catalogs.
INSERT INTO "categorias_calidad" ("codigo", "nombre")
SELECT DISTINCT 'LEGACY_' || upper(substr(md5(trim(value)), 1, 12)), trim(value)
FROM (
    SELECT "categoria_calidad" AS value FROM "controles_calidad"
    UNION
    SELECT "categoria" AS value FROM "empaques"
) source
WHERE value IS NOT NULL
  AND trim(value) <> ''
  AND upper(trim(value)) NOT IN ('EXTRA', 'EXTRA / PREMIUM', 'PRIMERA', 'SEGUNDA', 'INDUSTRIAL')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "tipos_certificacion" ("codigo", "nombre")
SELECT DISTINCT 'LEGACY_' || upper(substr(md5(trim("tipo_certificacion")), 1, 12)), trim("tipo_certificacion")
FROM "certificaciones"
WHERE trim("tipo_certificacion") <> ''
  AND upper(trim("tipo_certificacion")) NOT IN (
    'FITOSANITARIA', 'CERTIFICACIÓN FITOSANITARIA', 'GLOBALGAP', 'GLOBALG.A.P.',
    'ORGÁNICA', 'CERTIFICACIÓN ORGÁNICA', 'GRASP', 'COMERCIO JUSTO', 'RAINFOREST ALLIANCE'
  )
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "entidades_certificadoras" ("codigo", "nombre")
SELECT DISTINCT 'LEGACY_' || upper(substr(md5(trim("entidad_emisora")), 1, 12)), trim("entidad_emisora")
FROM "certificaciones" c
WHERE trim(c."entidad_emisora") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "entidades_certificadoras" e
    WHERE lower(e."nombre") = lower(trim(c."entidad_emisora"))
  )
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "tipos_documento" ("codigo", "nombre")
SELECT DISTINCT 'LEGACY_' || upper(substr(md5(trim("tipo")), 1, 12)), trim("tipo")
FROM "documentos_referencia" d
WHERE trim(d."tipo") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "tipos_documento" t
    WHERE lower(t."nombre") = lower(trim(d."tipo")) OR upper(t."codigo") = upper(trim(d."tipo"))
  )
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "navieras" ("codigo", "nombre")
SELECT DISTINCT 'LEGACY_' || upper(substr(md5(trim("naviera")), 1, 12)), trim("naviera")
FROM "envios" e
WHERE e."naviera" IS NOT NULL
  AND trim(e."naviera") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "navieras" n
    WHERE lower(n."nombre") = lower(trim(e."naviera")) OR upper(n."codigo") = upper(trim(e."naviera"))
  )
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "puertos" ("codigo", "nombre", "pais_nombre")
SELECT DISTINCT 'LEGACY_' || upper(substr(md5('ORIGEN:' || trim("puerto_origen")), 1, 12)), trim("puerto_origen"), NULL
FROM "envios" e
WHERE trim(e."puerto_origen") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "puertos" p WHERE lower(p."nombre") = lower(trim(e."puerto_origen"))
  )
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "puertos" ("codigo", "nombre", "pais_nombre")
SELECT DISTINCT
  'LEGACY_' || upper(substr(md5('DESTINO:' || trim("puerto_destino") || ':' || trim("pais_destino")), 1, 12)),
  trim("puerto_destino"),
  trim("pais_destino")
FROM "envios" e
WHERE trim(e."puerto_destino") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "puertos" p
    WHERE lower(p."nombre") = lower(trim(e."puerto_destino"))
      AND lower(coalesce(p."pais_nombre", '')) = lower(trim(e."pais_destino"))
  )
ON CONFLICT ("codigo") DO NOTHING;

ALTER TABLE "controles_calidad" ADD COLUMN "id_categoria_calidad" SMALLINT;
ALTER TABLE "empaques" ADD COLUMN "id_categoria_calidad" SMALLINT;
ALTER TABLE "certificaciones" ADD COLUMN "id_tipo_certificacion" SMALLINT;
ALTER TABLE "certificaciones" ADD COLUMN "id_entidad_certificadora" SMALLINT;
ALTER TABLE "documentos_referencia" ADD COLUMN "id_tipo_documento" SMALLINT;
ALTER TABLE "envios" ADD COLUMN "id_naviera" SMALLINT;
ALTER TABLE "envios" ADD COLUMN "id_puerto_origen" SMALLINT;
ALTER TABLE "envios" ADD COLUMN "id_puerto_destino" SMALLINT;

UPDATE "controles_calidad" c
SET "id_categoria_calidad" = cat."id_categoria_calidad"
FROM "categorias_calidad" cat
WHERE cat."codigo" = CASE upper(trim(c."categoria_calidad"))
  WHEN 'EXTRA' THEN 'EXTRA_PREMIUM'
  WHEN 'EXTRA / PREMIUM' THEN 'EXTRA_PREMIUM'
  WHEN 'PRIMERA' THEN 'PRIMERA'
  WHEN 'SEGUNDA' THEN 'SEGUNDA'
  WHEN 'INDUSTRIAL' THEN 'INDUSTRIAL'
  ELSE 'LEGACY_' || upper(substr(md5(trim(c."categoria_calidad")), 1, 12))
END;

UPDATE "empaques" e
SET "id_categoria_calidad" = cat."id_categoria_calidad"
FROM "categorias_calidad" cat
WHERE cat."codigo" = CASE upper(trim(e."categoria"))
  WHEN 'EXTRA' THEN 'EXTRA_PREMIUM'
  WHEN 'EXTRA / PREMIUM' THEN 'EXTRA_PREMIUM'
  WHEN 'PRIMERA' THEN 'PRIMERA'
  WHEN 'SEGUNDA' THEN 'SEGUNDA'
  WHEN 'INDUSTRIAL' THEN 'INDUSTRIAL'
  ELSE 'LEGACY_' || upper(substr(md5(trim(e."categoria")), 1, 12))
END;

UPDATE "certificaciones" c
SET "id_tipo_certificacion" = t."id_tipo_certificacion"
FROM "tipos_certificacion" t
WHERE t."codigo" = CASE upper(trim(c."tipo_certificacion"))
  WHEN 'FITOSANITARIA' THEN 'FITOSANITARIA'
  WHEN 'CERTIFICACIÓN FITOSANITARIA' THEN 'FITOSANITARIA'
  WHEN 'GLOBALGAP' THEN 'GLOBALGAP'
  WHEN 'GLOBALG.A.P.' THEN 'GLOBALGAP'
  WHEN 'ORGÁNICA' THEN 'ORGANICA'
  WHEN 'CERTIFICACIÓN ORGÁNICA' THEN 'ORGANICA'
  WHEN 'GRASP' THEN 'GRASP'
  WHEN 'COMERCIO JUSTO' THEN 'COMERCIO_JUSTO'
  WHEN 'RAINFOREST ALLIANCE' THEN 'RAINFOREST_ALLIANCE'
  ELSE 'LEGACY_' || upper(substr(md5(trim(c."tipo_certificacion")), 1, 12))
END;

UPDATE "certificaciones" c
SET "id_entidad_certificadora" = e."id_entidad_certificadora"
FROM "entidades_certificadoras" e
WHERE lower(e."nombre") = lower(trim(c."entidad_emisora"))
   OR e."codigo" = 'LEGACY_' || upper(substr(md5(trim(c."entidad_emisora")), 1, 12));

UPDATE "documentos_referencia" d
SET "id_tipo_documento" = t."id_tipo_documento"
FROM "tipos_documento" t
WHERE lower(t."nombre") = lower(trim(d."tipo"))
   OR upper(t."codigo") = upper(trim(d."tipo"))
   OR t."codigo" = 'LEGACY_' || upper(substr(md5(trim(d."tipo")), 1, 12));

UPDATE "envios" e
SET "id_naviera" = n."id_naviera"
FROM "navieras" n
WHERE e."naviera" IS NOT NULL
  AND (
    lower(n."nombre") = lower(trim(e."naviera"))
    OR upper(n."codigo") = upper(trim(e."naviera"))
    OR n."codigo" = 'LEGACY_' || upper(substr(md5(trim(e."naviera")), 1, 12))
  );

UPDATE "envios" e
SET "id_puerto_origen" = p."id_puerto"
FROM "puertos" p
WHERE lower(p."nombre") = lower(trim(e."puerto_origen"))
   OR p."codigo" = 'LEGACY_' || upper(substr(md5('ORIGEN:' || trim(e."puerto_origen")), 1, 12));

UPDATE "envios" e
SET "id_puerto_destino" = p."id_puerto"
FROM "puertos" p
WHERE (
    lower(p."nombre") = lower(trim(e."puerto_destino"))
    AND lower(coalesce(p."pais_nombre", '')) = lower(trim(e."pais_destino"))
  )
  OR p."codigo" = 'LEGACY_' || upper(substr(md5('DESTINO:' || trim(e."puerto_destino") || ':' || trim(e."pais_destino")), 1, 12));

ALTER TABLE "certificaciones" ALTER COLUMN "id_tipo_certificacion" SET NOT NULL;
ALTER TABLE "certificaciones" ALTER COLUMN "id_entidad_certificadora" SET NOT NULL;
ALTER TABLE "documentos_referencia" ALTER COLUMN "id_tipo_documento" SET NOT NULL;
ALTER TABLE "envios" ALTER COLUMN "id_puerto_origen" SET NOT NULL;
ALTER TABLE "envios" ALTER COLUMN "id_puerto_destino" SET NOT NULL;

ALTER TABLE "controles_calidad" DROP COLUMN "categoria_calidad";
ALTER TABLE "empaques" DROP COLUMN "categoria";
ALTER TABLE "certificaciones" DROP COLUMN "tipo_certificacion";
ALTER TABLE "certificaciones" DROP COLUMN "entidad_emisora";
ALTER TABLE "documentos_referencia" DROP COLUMN "tipo";
ALTER TABLE "envios" DROP COLUMN "naviera";
ALTER TABLE "envios" DROP COLUMN "puerto_origen";
ALTER TABLE "envios" DROP COLUMN "puerto_destino";
ALTER TABLE "envios" DROP COLUMN "pais_destino";

CREATE INDEX "controles_calidad_id_categoria_calidad_idx" ON "controles_calidad"("id_categoria_calidad");
CREATE INDEX "empaques_id_categoria_calidad_idx" ON "empaques"("id_categoria_calidad");
CREATE INDEX "certificaciones_id_tipo_certificacion_idx" ON "certificaciones"("id_tipo_certificacion");
CREATE INDEX "certificaciones_id_entidad_certificadora_idx" ON "certificaciones"("id_entidad_certificadora");
CREATE INDEX "documentos_referencia_id_tipo_documento_idx" ON "documentos_referencia"("id_tipo_documento");
CREATE INDEX "envios_id_naviera_idx" ON "envios"("id_naviera");
CREATE INDEX "envios_id_puerto_origen_idx" ON "envios"("id_puerto_origen");
CREATE INDEX "envios_id_puerto_destino_idx" ON "envios"("id_puerto_destino");

ALTER TABLE "controles_calidad" ADD CONSTRAINT "controles_calidad_id_categoria_calidad_fkey"
FOREIGN KEY ("id_categoria_calidad") REFERENCES "categorias_calidad"("id_categoria_calidad") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "empaques" ADD CONSTRAINT "empaques_id_categoria_calidad_fkey"
FOREIGN KEY ("id_categoria_calidad") REFERENCES "categorias_calidad"("id_categoria_calidad") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "certificaciones" ADD CONSTRAINT "certificaciones_id_tipo_certificacion_fkey"
FOREIGN KEY ("id_tipo_certificacion") REFERENCES "tipos_certificacion"("id_tipo_certificacion") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "certificaciones" ADD CONSTRAINT "certificaciones_id_entidad_certificadora_fkey"
FOREIGN KEY ("id_entidad_certificadora") REFERENCES "entidades_certificadoras"("id_entidad_certificadora") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "documentos_referencia" ADD CONSTRAINT "documentos_referencia_id_tipo_documento_fkey"
FOREIGN KEY ("id_tipo_documento") REFERENCES "tipos_documento"("id_tipo_documento") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "envios" ADD CONSTRAINT "envios_id_naviera_fkey"
FOREIGN KEY ("id_naviera") REFERENCES "navieras"("id_naviera") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "envios" ADD CONSTRAINT "envios_id_puerto_origen_fkey"
FOREIGN KEY ("id_puerto_origen") REFERENCES "puertos"("id_puerto") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "envios" ADD CONSTRAINT "envios_id_puerto_destino_fkey"
FOREIGN KEY ("id_puerto_destino") REFERENCES "puertos"("id_puerto") ON DELETE RESTRICT ON UPDATE CASCADE;
