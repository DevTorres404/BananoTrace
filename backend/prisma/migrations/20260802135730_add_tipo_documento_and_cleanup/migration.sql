-- Recreate catalog tables
CREATE TABLE IF NOT EXISTS "categorias_calidad" ("id_categoria_calidad" SERIAL NOT NULL, "codigo" VARCHAR(40) NOT NULL, "nombre" VARCHAR(100) NOT NULL, "descripcion" VARCHAR(255), "activo" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "categorias_calidad_pkey" PRIMARY KEY ("id_categoria_calidad"));
CREATE UNIQUE INDEX IF NOT EXISTS "categorias_calidad_codigo_key" ON "categorias_calidad"("codigo");
CREATE TABLE IF NOT EXISTS "navieras" ("id_naviera" SERIAL NOT NULL, "codigo" VARCHAR(40) NOT NULL, "nombre" VARCHAR(100) NOT NULL, "activo" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "navieras_pkey" PRIMARY KEY ("id_naviera"));
CREATE UNIQUE INDEX IF NOT EXISTS "navieras_codigo_key" ON "navieras"("codigo");
CREATE TABLE IF NOT EXISTS "puertos" ("id_puerto" SERIAL NOT NULL, "codigo" VARCHAR(10) NOT NULL, "nombre" VARCHAR(100) NOT NULL, "pais_codigo" VARCHAR(5) NOT NULL, "pais_nombre" VARCHAR(80) NOT NULL, "activo" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "puertos_pkey" PRIMARY KEY ("id_puerto"));
CREATE UNIQUE INDEX IF NOT EXISTS "puertos_codigo_key" ON "puertos"("codigo");
CREATE TABLE IF NOT EXISTS "tipos_certificacion" ("id_tipo_certificacion" SERIAL NOT NULL, "codigo" VARCHAR(40) NOT NULL, "nombre" VARCHAR(100) NOT NULL, "activo" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "tipos_certificacion_pkey" PRIMARY KEY ("id_tipo_certificacion"));
CREATE UNIQUE INDEX IF NOT EXISTS "tipos_certificacion_codigo_key" ON "tipos_certificacion"("codigo");
CREATE TABLE IF NOT EXISTS "entidades_certificadoras" ("id_entidad_certificadora" SERIAL NOT NULL, "codigo" VARCHAR(40) NOT NULL, "nombre" VARCHAR(100) NOT NULL, "alcance" VARCHAR(100), "activo" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "entidades_certificadoras_pkey" PRIMARY KEY ("id_entidad_certificadora"));
CREATE UNIQUE INDEX IF NOT EXISTS "entidades_certificadoras_codigo_key" ON "entidades_certificadoras"("codigo");
-- TipoDocumento add descripcion
ALTER TABLE "tipos_documento" ADD COLUMN IF NOT EXISTS "descripcion" VARCHAR(255);
-- controles_calidad
-- Esta migración quedó anulada: intentaba crear/alterar las mismas tablas de catálogo
-- (categorias_calidad, navieras, puertos, tipos_certificacion, entidades_certificadoras,
-- tipos_documento) que la migración posterior 20260802154500_add_domain_catalogs crea de
-- forma completa (con la migración de datos legados incluida). Al ejecutarse antes que esa
-- migración, dejaba las tablas de catálogo con columnas distintas y las columnas de texto
-- libre (categoria_calidad, categoria, tipo_certificacion, entidad_emisora, tipo, naviera,
-- puerto_origen, puerto_destino, pais_destino) ya eliminadas, lo que hacía fallar la
-- migración de datos legados de 20260802154500 en cualquier base que llegara a tenerlas.
-- En la práctica nunca pudo aplicarse con éxito en ninguna base (la migración posterior
-- también falla si esta corrió primero), así que se deja como no-op para no romper el
-- historial de migraciones ya registrado.
SELECT 1;
-- empaques
ALTER TABLE "empaques" DROP COLUMN IF EXISTS "categoria";
ALTER TABLE "empaques" ADD COLUMN IF NOT EXISTS "id_categoria_calidad" INTEGER;
ALTER TABLE "empaques" DROP CONSTRAINT IF EXISTS "empaques_id_categoria_calidad_fkey";
ALTER TABLE "empaques" ADD CONSTRAINT "empaques_id_categoria_calidad_fkey" FOREIGN KEY ("id_categoria_calidad") REFERENCES "categorias_calidad"("id_categoria_calidad") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "empaques_id_categoria_calidad_idx" ON "empaques"("id_categoria_calidad");
-- envios
ALTER TABLE "envios" DROP COLUMN IF EXISTS "naviera";
ALTER TABLE "envios" DROP COLUMN IF EXISTS "puerto_origen";
ALTER TABLE "envios" DROP COLUMN IF EXISTS "puerto_destino";
ALTER TABLE "envios" DROP COLUMN IF EXISTS "pais_destino";
ALTER TABLE "envios" ADD COLUMN IF NOT EXISTS "id_naviera" INTEGER;
ALTER TABLE "envios" ADD COLUMN IF NOT EXISTS "id_puerto_origen" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "envios" ADD COLUMN IF NOT EXISTS "id_puerto_destino" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "envios" ALTER COLUMN "id_puerto_origen" DROP DEFAULT;
ALTER TABLE "envios" ALTER COLUMN "id_puerto_destino" DROP DEFAULT;
ALTER TABLE "envios" DROP CONSTRAINT IF EXISTS "envios_id_naviera_fkey";
ALTER TABLE "envios" ADD CONSTRAINT "envios_id_naviera_fkey" FOREIGN KEY ("id_naviera") REFERENCES "navieras"("id_naviera") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "envios" DROP CONSTRAINT IF EXISTS "envios_id_puerto_origen_fkey";
ALTER TABLE "envios" ADD CONSTRAINT "envios_id_puerto_origen_fkey" FOREIGN KEY ("id_puerto_origen") REFERENCES "puertos"("id_puerto") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "envios" DROP CONSTRAINT IF EXISTS "envios_id_puerto_destino_fkey";
ALTER TABLE "envios" ADD CONSTRAINT "envios_id_puerto_destino_fkey" FOREIGN KEY ("id_puerto_destino") REFERENCES "puertos"("id_puerto") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "envios_id_naviera_idx" ON "envios"("id_naviera");
CREATE INDEX IF NOT EXISTS "envios_id_puerto_origen_idx" ON "envios"("id_puerto_origen");
CREATE INDEX IF NOT EXISTS "envios_id_puerto_destino_idx" ON "envios"("id_puerto_destino");
-- certificaciones
ALTER TABLE "certificaciones" DROP COLUMN IF EXISTS "tipo_certificacion";
ALTER TABLE "certificaciones" DROP COLUMN IF EXISTS "entidad_emisora";
ALTER TABLE "certificaciones" ADD COLUMN IF NOT EXISTS "id_tipo_certificacion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "certificaciones" ADD COLUMN IF NOT EXISTS "id_entidad_certificadora" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "certificaciones" ALTER COLUMN "id_tipo_certificacion" DROP DEFAULT;
ALTER TABLE "certificaciones" ALTER COLUMN "id_entidad_certificadora" DROP DEFAULT;
ALTER TABLE "certificaciones" DROP CONSTRAINT IF EXISTS "certificaciones_id_tipo_certificacion_fkey";
ALTER TABLE "certificaciones" ADD CONSTRAINT "certificaciones_id_tipo_certificacion_fkey" FOREIGN KEY ("id_tipo_certificacion") REFERENCES "tipos_certificacion"("id_tipo_certificacion") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certificaciones" DROP CONSTRAINT IF EXISTS "certificaciones_id_entidad_certificadora_fkey";
ALTER TABLE "certificaciones" ADD CONSTRAINT "certificaciones_id_entidad_certificadora_fkey" FOREIGN KEY ("id_entidad_certificadora") REFERENCES "entidades_certificadoras"("id_entidad_certificadora") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "certificaciones_id_tipo_certificacion_idx" ON "certificaciones"("id_tipo_certificacion");
CREATE INDEX IF NOT EXISTS "certificaciones_id_entidad_certificadora_idx" ON "certificaciones"("id_entidad_certificadora");