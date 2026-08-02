-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "estado_lote" AS ENUM ('PLANIFICADO', 'EN_PRODUCCION', 'COSECHADO', 'EMPACADO', 'EXPORTADO', 'CERRADO');

-- CreateEnum
CREATE TYPE "resultado_control" AS ENUM ('APROBADO', 'OBSERVADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "estado_empaque" AS ENUM ('DISPONIBLE', 'ASIGNADO', 'EN_TRANSITO', 'ENTREGADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "estado_envio" AS ENUM ('PLANIFICADO', 'CARGADO', 'EN_TRANSITO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "estado_confirmacion_blockchain" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'ERROR');

-- CreateEnum
CREATE TYPE "estado_flujo" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'RECHAZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "tipo_unidad_trazable" AS ENUM ('LOTE', 'EMPAQUE', 'ENVIO');

-- CreateEnum
CREATE TYPE "rol_unidad_flujo" AS ENUM ('PRINCIPAL', 'ENTRADA', 'SALIDA');

-- CreateTable
CREATE TABLE "roles" (
    "id_rol" SMALLSERIAL NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "descripcion" VARCHAR(150),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id_rol")
);

-- CreateTable
CREATE TABLE "pantallas" (
    "id_pantalla" SMALLSERIAL NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "ruta" VARCHAR(120) NOT NULL,
    "icono" VARCHAR(50),
    "descripcion" VARCHAR(200),
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pantallas_pkey" PRIMARY KEY ("id_pantalla")
);

-- CreateTable
CREATE TABLE "menus" (
    "id_menu" SMALLSERIAL NOT NULL,
    "id_pantalla" SMALLINT,
    "id_menu_padre" SMALLINT,
    "etiqueta" VARCHAR(60) NOT NULL,
    "icono" VARCHAR(50),
    "orden" SMALLINT NOT NULL DEFAULT 0,
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id_menu")
);

-- CreateTable
CREATE TABLE "rol_menu" (
    "id_rol" SMALLINT NOT NULL,
    "id_menu" SMALLINT NOT NULL,

    CONSTRAINT "rol_menu_pkey" PRIMARY KEY ("id_rol","id_menu")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id_usuario" BIGSERIAL NOT NULL,
    "id_rol" SMALLINT NOT NULL,
    "nombres" VARCHAR(80) NOT NULL,
    "apellidos" VARCHAR(80) NOT NULL,
    "correo" VARCHAR(120) NOT NULL,
    "clave_hash" VARCHAR(255) NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(6),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "flujos" (
    "id_flujo" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "version" SMALLINT NOT NULL DEFAULT 1,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flujos_pkey" PRIMARY KEY ("id_flujo")
);

-- CreateTable
CREATE TABLE "fases" (
    "id_fase" SMALLSERIAL NOT NULL,
    "id_flujo" SMALLINT NOT NULL,
    "id_rol_responsable" SMALLINT,
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "orden" SMALLINT NOT NULL,
    "requiere_aprobacion" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fases_pkey" PRIMARY KEY ("id_fase")
);

-- CreateTable
CREATE TABLE "transiciones_fase" (
    "id_transicion_fase" SMALLSERIAL NOT NULL,
    "id_fase_origen" SMALLINT NOT NULL,
    "id_fase_destino" SMALLINT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "transiciones_fase_pkey" PRIMARY KEY ("id_transicion_fase")
);

-- CreateTable
CREATE TABLE "unidades_trazables" (
    "id_unidad" BIGSERIAL NOT NULL,
    "tipo" "tipo_unidad_trazable" NOT NULL,
    "codigo" VARCHAR(255) NOT NULL,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidades_trazables_pkey" PRIMARY KEY ("id_unidad")
);

-- CreateTable
CREATE TABLE "flujo_instancias" (
    "id_instancia" BIGSERIAL NOT NULL,
    "id_flujo" SMALLINT NOT NULL,
    "codigo" VARCHAR(100) NOT NULL,
    "estado" "estado_flujo" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_inicio" TIMESTAMPTZ(6),
    "fecha_fin" TIMESTAMPTZ(6),
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flujo_instancias_pkey" PRIMARY KEY ("id_instancia")
);

-- CreateTable
CREATE TABLE "flujo_instancia_unidad" (
    "id_instancia" BIGINT NOT NULL,
    "id_unidad" BIGINT NOT NULL,
    "rol" "rol_unidad_flujo" NOT NULL DEFAULT 'PRINCIPAL',

    CONSTRAINT "flujo_instancia_unidad_pkey" PRIMARY KEY ("id_instancia","id_unidad")
);

-- CreateTable
CREATE TABLE "fase_ejecuciones" (
    "id_ejecucion" BIGSERIAL NOT NULL,
    "id_instancia" BIGINT NOT NULL,
    "id_fase" SMALLINT NOT NULL,
    "id_flujo" SMALLINT NOT NULL,
    "id_responsable" BIGINT,
    "numero_intento" SMALLINT NOT NULL DEFAULT 1,
    "estado" "estado_flujo" NOT NULL DEFAULT 'PENDIENTE',
    "datos_adicionales" JSONB NOT NULL DEFAULT '{}',
    "fecha_inicio" TIMESTAMPTZ(6),
    "fecha_fin" TIMESTAMPTZ(6),
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fase_ejecuciones_pkey" PRIMARY KEY ("id_ejecucion")
);

-- CreateTable
CREATE TABLE "transiciones_ejecucion" (
    "id_transicion" BIGSERIAL NOT NULL,
    "id_ejecucion" BIGINT NOT NULL,
    "id_usuario" BIGINT NOT NULL,
    "estado_anterior" "estado_flujo",
    "estado_nuevo" "estado_flujo" NOT NULL,
    "comentario" TEXT,
    "datos_adicionales" JSONB NOT NULL DEFAULT '{}',
    "fecha_transicion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transiciones_ejecucion_pkey" PRIMARY KEY ("id_transicion")
);

-- CreateTable
CREATE TABLE "productores" (
    "id_productor" BIGSERIAL NOT NULL,
    "identificacion" VARCHAR(20) NOT NULL,
    "nombre_razon_social" VARCHAR(150) NOT NULL,
    "telefono" VARCHAR(20),
    "correo" VARCHAR(120),
    "direccion" TEXT,
    "fecha_actualizacion" TIMESTAMPTZ(6),

    CONSTRAINT "productores_pkey" PRIMARY KEY ("id_productor")
);

-- CreateTable
CREATE TABLE "fincas" (
    "id_finca" BIGSERIAL NOT NULL,
    "id_productor" BIGINT NOT NULL,
    "codigo_finca" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "provincia" VARCHAR(60) NOT NULL,
    "canton" VARCHAR(60) NOT NULL,
    "parroquia" VARCHAR(60),
    "latitud" DECIMAL(9,6),
    "longitud" DECIMAL(9,6),
    "area_hectareas" DECIMAL(10,2),
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "fecha_actualizacion" TIMESTAMPTZ(6),

    CONSTRAINT "fincas_pkey" PRIMARY KEY ("id_finca")
);

-- CreateTable
CREATE TABLE "lotes_produccion" (
    "id_lote" BIGSERIAL NOT NULL,
    "id_unidad" BIGINT NOT NULL,
    "id_finca" BIGINT NOT NULL,
    "codigo_lote" VARCHAR(40) NOT NULL,
    "variedad" VARCHAR(60) NOT NULL DEFAULT 'Cavendish',
    "fecha_siembra" DATE,
    "fecha_estimada_cosecha" DATE,
    "fecha_cosecha" DATE,
    "cantidad_plantas" INTEGER,
    "peso_cosechado_kg" DECIMAL(12,2),
    "estado" "estado_lote" NOT NULL DEFAULT 'PLANIFICADO',
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(6),

    CONSTRAINT "lotes_produccion_pkey" PRIMARY KEY ("id_lote")
);

-- CreateTable
CREATE TABLE "tipos_evento" (
    "id_tipo_evento" SMALLSERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "descripcion" VARCHAR(200),

    CONSTRAINT "tipos_evento_pkey" PRIMARY KEY ("id_tipo_evento")
);

-- CreateTable
CREATE TABLE "eventos_trazabilidad" (
    "id_evento" BIGSERIAL NOT NULL,
    "id_unidad" BIGINT NOT NULL,
    "id_ejecucion" BIGINT NOT NULL,
    "id_tipo_evento" SMALLINT NOT NULL,
    "id_usuario" BIGINT NOT NULL,
    "fecha_evento" TIMESTAMPTZ(6) NOT NULL,
    "ubicacion" VARCHAR(150),
    "descripcion" TEXT,
    "datos_adicionales" JSONB NOT NULL DEFAULT '{}',
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_trazabilidad_pkey" PRIMARY KEY ("id_evento")
);

-- CreateTable
CREATE TABLE "controles_calidad" (
    "id_control" BIGSERIAL NOT NULL,
    "id_ejecucion" BIGINT NOT NULL,
    "id_lote" BIGINT NOT NULL,
    "id_usuario" BIGINT NOT NULL,
    "fecha_control" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoria_calidad" VARCHAR(30),
    "calibre_mm" DECIMAL(6,2),
    "peso_muestra_kg" DECIMAL(8,2),
    "porcentaje_rechazo" DECIMAL(5,2),
    "resultado" "resultado_control" NOT NULL,
    "observaciones" TEXT,

    CONSTRAINT "controles_calidad_pkey" PRIMARY KEY ("id_control")
);

-- CreateTable
CREATE TABLE "certificaciones" (
    "id_certificacion" BIGSERIAL NOT NULL,
    "id_finca" BIGINT NOT NULL,
    "tipo_certificacion" VARCHAR(80) NOT NULL,
    "entidad_emisora" VARCHAR(120) NOT NULL,
    "numero_certificado" VARCHAR(80) NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "documento_url" VARCHAR(500),

    CONSTRAINT "certificaciones_pkey" PRIMARY KEY ("id_certificacion")
);

-- CreateTable
CREATE TABLE "empaques" (
    "id_empaque" BIGSERIAL NOT NULL,
    "id_unidad" BIGINT NOT NULL,
    "id_ejecucion" BIGINT NOT NULL,
    "id_lote" BIGINT NOT NULL,
    "codigo_caja" VARCHAR(50) NOT NULL,
    "fecha_empaque" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "peso_neto_kg" DECIMAL(8,2) NOT NULL,
    "categoria" VARCHAR(30),
    "codigo_qr" VARCHAR(255),
    "estado" "estado_empaque" NOT NULL DEFAULT 'DISPONIBLE',

    CONSTRAINT "empaques_pkey" PRIMARY KEY ("id_empaque")
);

-- CreateTable
CREATE TABLE "envios" (
    "id_envio" BIGSERIAL NOT NULL,
    "id_unidad" BIGINT NOT NULL,
    "id_ejecucion" BIGINT NOT NULL,
    "codigo_envio" VARCHAR(40) NOT NULL,
    "numero_contenedor" VARCHAR(30),
    "naviera" VARCHAR(100),
    "puerto_origen" VARCHAR(100) NOT NULL,
    "puerto_destino" VARCHAR(100) NOT NULL,
    "pais_destino" VARCHAR(80) NOT NULL,
    "fecha_salida" TIMESTAMPTZ(6),
    "fecha_estimada_llegada" TIMESTAMPTZ(6),
    "temperatura_salida" DECIMAL(5,2),
    "estado" "estado_envio" NOT NULL DEFAULT 'PLANIFICADO',

    CONSTRAINT "envios_pkey" PRIMARY KEY ("id_envio")
);

-- CreateTable
CREATE TABLE "envio_empaque" (
    "id_envio" BIGINT NOT NULL,
    "id_empaque" BIGINT NOT NULL,

    CONSTRAINT "envio_empaque_pkey" PRIMARY KEY ("id_envio","id_empaque")
);

-- CreateTable
CREATE TABLE "registros_blockchain" (
    "id_registro_blockchain" BIGSERIAL NOT NULL,
    "id_instancia" BIGINT NOT NULL,
    "id_transicion" BIGINT NOT NULL,
    "indice" INTEGER NOT NULL,
    "hash_datos" CHAR(64) NOT NULL,
    "hash_anterior" CHAR(64),
    "payload_canonico" TEXT NOT NULL,
    "algoritmo" VARCHAR(20) NOT NULL DEFAULT 'SHA-256',
    "identificador_transaccion" VARCHAR(150),
    "red_blockchain" VARCHAR(60),
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado_confirmacion" "estado_confirmacion_blockchain" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "registros_blockchain_pkey" PRIMARY KEY ("id_registro_blockchain")
);

-- CreateTable
CREATE TABLE "documentos_referencia" (
    "id_documento" BIGSERIAL NOT NULL,
    "id_evento" BIGINT NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "fecha_carga" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_referencia_pkey" PRIMARY KEY ("id_documento")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "pantallas_ruta_key" ON "pantallas"("ruta");

-- CreateIndex
CREATE INDEX "menus_id_pantalla_idx" ON "menus"("id_pantalla");

-- CreateIndex
CREATE INDEX "menus_id_menu_padre_idx" ON "menus"("id_menu_padre");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE INDEX "usuarios_id_rol_idx" ON "usuarios"("id_rol");

-- CreateIndex
CREATE INDEX "flujos_activo_idx" ON "flujos"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "flujos_codigo_version_key" ON "flujos"("codigo", "version");

-- CreateIndex
CREATE INDEX "fases_id_rol_responsable_idx" ON "fases"("id_rol_responsable");

-- CreateIndex
CREATE UNIQUE INDEX "fases_id_flujo_codigo_key" ON "fases"("id_flujo", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "fases_id_flujo_orden_key" ON "fases"("id_flujo", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "fases_id_fase_id_flujo_key" ON "fases"("id_fase", "id_flujo");

-- CreateIndex
CREATE INDEX "transiciones_fase_id_fase_destino_idx" ON "transiciones_fase"("id_fase_destino");

-- CreateIndex
CREATE UNIQUE INDEX "transiciones_fase_id_fase_origen_id_fase_destino_key" ON "transiciones_fase"("id_fase_origen", "id_fase_destino");

-- CreateIndex
CREATE INDEX "unidades_trazables_tipo_idx" ON "unidades_trazables"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_trazables_tipo_codigo_key" ON "unidades_trazables"("tipo", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "flujo_instancias_codigo_key" ON "flujo_instancias"("codigo");

-- CreateIndex
CREATE INDEX "flujo_instancias_id_flujo_estado_idx" ON "flujo_instancias"("id_flujo", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "flujo_instancias_id_instancia_id_flujo_key" ON "flujo_instancias"("id_instancia", "id_flujo");

-- CreateIndex
CREATE INDEX "flujo_instancia_unidad_id_unidad_rol_idx" ON "flujo_instancia_unidad"("id_unidad", "rol");

-- CreateIndex
CREATE INDEX "fase_ejecuciones_id_instancia_estado_idx" ON "fase_ejecuciones"("id_instancia", "estado");

-- CreateIndex
CREATE INDEX "fase_ejecuciones_id_fase_idx" ON "fase_ejecuciones"("id_fase");

-- CreateIndex
CREATE INDEX "fase_ejecuciones_id_responsable_idx" ON "fase_ejecuciones"("id_responsable");

-- CreateIndex
CREATE UNIQUE INDEX "fase_ejecuciones_id_instancia_id_fase_numero_intento_key" ON "fase_ejecuciones"("id_instancia", "id_fase", "numero_intento");

-- CreateIndex
CREATE INDEX "transiciones_ejecucion_id_ejecucion_fecha_transicion_idx" ON "transiciones_ejecucion"("id_ejecucion", "fecha_transicion");

-- CreateIndex
CREATE INDEX "transiciones_ejecucion_id_usuario_idx" ON "transiciones_ejecucion"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "productores_identificacion_key" ON "productores"("identificacion");

-- CreateIndex
CREATE UNIQUE INDEX "fincas_codigo_finca_key" ON "fincas"("codigo_finca");

-- CreateIndex
CREATE INDEX "fincas_id_productor_idx" ON "fincas"("id_productor");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_produccion_id_unidad_key" ON "lotes_produccion"("id_unidad");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_produccion_codigo_lote_key" ON "lotes_produccion"("codigo_lote");

-- CreateIndex
CREATE INDEX "lotes_produccion_id_finca_idx" ON "lotes_produccion"("id_finca");

-- CreateIndex
CREATE INDEX "lotes_produccion_estado_idx" ON "lotes_produccion"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_evento_nombre_key" ON "tipos_evento"("nombre");

-- CreateIndex
CREATE INDEX "eventos_trazabilidad_id_unidad_fecha_evento_idx" ON "eventos_trazabilidad"("id_unidad", "fecha_evento");

-- CreateIndex
CREATE INDEX "eventos_trazabilidad_id_ejecucion_idx" ON "eventos_trazabilidad"("id_ejecucion");

-- CreateIndex
CREATE INDEX "eventos_trazabilidad_id_tipo_evento_idx" ON "eventos_trazabilidad"("id_tipo_evento");

-- CreateIndex
CREATE INDEX "eventos_trazabilidad_id_usuario_idx" ON "eventos_trazabilidad"("id_usuario");

-- CreateIndex
CREATE INDEX "controles_calidad_id_ejecucion_idx" ON "controles_calidad"("id_ejecucion");

-- CreateIndex
CREATE INDEX "controles_calidad_id_lote_fecha_control_idx" ON "controles_calidad"("id_lote", "fecha_control");

-- CreateIndex
CREATE INDEX "controles_calidad_id_usuario_idx" ON "controles_calidad"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "certificaciones_numero_certificado_key" ON "certificaciones"("numero_certificado");

-- CreateIndex
CREATE INDEX "certificaciones_id_finca_idx" ON "certificaciones"("id_finca");

-- CreateIndex
CREATE UNIQUE INDEX "empaques_id_unidad_key" ON "empaques"("id_unidad");

-- CreateIndex
CREATE UNIQUE INDEX "empaques_codigo_caja_key" ON "empaques"("codigo_caja");

-- CreateIndex
CREATE UNIQUE INDEX "empaques_codigo_qr_key" ON "empaques"("codigo_qr");

-- CreateIndex
CREATE INDEX "empaques_id_ejecucion_idx" ON "empaques"("id_ejecucion");

-- CreateIndex
CREATE INDEX "empaques_id_lote_idx" ON "empaques"("id_lote");

-- CreateIndex
CREATE INDEX "empaques_estado_idx" ON "empaques"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "envios_id_unidad_key" ON "envios"("id_unidad");

-- CreateIndex
CREATE UNIQUE INDEX "envios_codigo_envio_key" ON "envios"("codigo_envio");

-- CreateIndex
CREATE INDEX "envios_id_ejecucion_idx" ON "envios"("id_ejecucion");

-- CreateIndex
CREATE INDEX "envios_estado_fecha_salida_idx" ON "envios"("estado", "fecha_salida");

-- CreateIndex
CREATE INDEX "envio_empaque_id_empaque_idx" ON "envio_empaque"("id_empaque");

-- CreateIndex
CREATE UNIQUE INDEX "registros_blockchain_id_transicion_key" ON "registros_blockchain"("id_transicion");

-- CreateIndex
CREATE UNIQUE INDEX "registros_blockchain_hash_datos_key" ON "registros_blockchain"("hash_datos");

-- CreateIndex
CREATE UNIQUE INDEX "registros_blockchain_id_instancia_indice_key" ON "registros_blockchain"("id_instancia", "indice");

-- CreateIndex
CREATE INDEX "documentos_referencia_id_evento_idx" ON "documentos_referencia"("id_evento");

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_id_pantalla_fkey" FOREIGN KEY ("id_pantalla") REFERENCES "pantallas"("id_pantalla") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_id_menu_padre_fkey" FOREIGN KEY ("id_menu_padre") REFERENCES "menus"("id_menu") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_menu" ADD CONSTRAINT "rol_menu_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "roles"("id_rol") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_menu" ADD CONSTRAINT "rol_menu_id_menu_fkey" FOREIGN KEY ("id_menu") REFERENCES "menus"("id_menu") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "roles"("id_rol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fases" ADD CONSTRAINT "fases_id_flujo_fkey" FOREIGN KEY ("id_flujo") REFERENCES "flujos"("id_flujo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fases" ADD CONSTRAINT "fases_id_rol_responsable_fkey" FOREIGN KEY ("id_rol_responsable") REFERENCES "roles"("id_rol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transiciones_fase" ADD CONSTRAINT "transiciones_fase_id_fase_origen_fkey" FOREIGN KEY ("id_fase_origen") REFERENCES "fases"("id_fase") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transiciones_fase" ADD CONSTRAINT "transiciones_fase_id_fase_destino_fkey" FOREIGN KEY ("id_fase_destino") REFERENCES "fases"("id_fase") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flujo_instancias" ADD CONSTRAINT "flujo_instancias_id_flujo_fkey" FOREIGN KEY ("id_flujo") REFERENCES "flujos"("id_flujo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flujo_instancia_unidad" ADD CONSTRAINT "flujo_instancia_unidad_id_instancia_fkey" FOREIGN KEY ("id_instancia") REFERENCES "flujo_instancias"("id_instancia") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flujo_instancia_unidad" ADD CONSTRAINT "flujo_instancia_unidad_id_unidad_fkey" FOREIGN KEY ("id_unidad") REFERENCES "unidades_trazables"("id_unidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fase_ejecuciones" ADD CONSTRAINT "fase_ejecuciones_id_instancia_id_flujo_fkey" FOREIGN KEY ("id_instancia", "id_flujo") REFERENCES "flujo_instancias"("id_instancia", "id_flujo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fase_ejecuciones" ADD CONSTRAINT "fase_ejecuciones_id_fase_id_flujo_fkey" FOREIGN KEY ("id_fase", "id_flujo") REFERENCES "fases"("id_fase", "id_flujo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fase_ejecuciones" ADD CONSTRAINT "fase_ejecuciones_id_responsable_fkey" FOREIGN KEY ("id_responsable") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transiciones_ejecucion" ADD CONSTRAINT "transiciones_ejecucion_id_ejecucion_fkey" FOREIGN KEY ("id_ejecucion") REFERENCES "fase_ejecuciones"("id_ejecucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transiciones_ejecucion" ADD CONSTRAINT "transiciones_ejecucion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fincas" ADD CONSTRAINT "fincas_id_productor_fkey" FOREIGN KEY ("id_productor") REFERENCES "productores"("id_productor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_produccion" ADD CONSTRAINT "lotes_produccion_id_unidad_fkey" FOREIGN KEY ("id_unidad") REFERENCES "unidades_trazables"("id_unidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_produccion" ADD CONSTRAINT "lotes_produccion_id_finca_fkey" FOREIGN KEY ("id_finca") REFERENCES "fincas"("id_finca") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_trazabilidad" ADD CONSTRAINT "eventos_trazabilidad_id_unidad_fkey" FOREIGN KEY ("id_unidad") REFERENCES "unidades_trazables"("id_unidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_trazabilidad" ADD CONSTRAINT "eventos_trazabilidad_id_ejecucion_fkey" FOREIGN KEY ("id_ejecucion") REFERENCES "fase_ejecuciones"("id_ejecucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_trazabilidad" ADD CONSTRAINT "eventos_trazabilidad_id_tipo_evento_fkey" FOREIGN KEY ("id_tipo_evento") REFERENCES "tipos_evento"("id_tipo_evento") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_trazabilidad" ADD CONSTRAINT "eventos_trazabilidad_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles_calidad" ADD CONSTRAINT "controles_calidad_id_ejecucion_fkey" FOREIGN KEY ("id_ejecucion") REFERENCES "fase_ejecuciones"("id_ejecucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles_calidad" ADD CONSTRAINT "controles_calidad_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "lotes_produccion"("id_lote") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles_calidad" ADD CONSTRAINT "controles_calidad_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificaciones" ADD CONSTRAINT "certificaciones_id_finca_fkey" FOREIGN KEY ("id_finca") REFERENCES "fincas"("id_finca") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empaques" ADD CONSTRAINT "empaques_id_unidad_fkey" FOREIGN KEY ("id_unidad") REFERENCES "unidades_trazables"("id_unidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empaques" ADD CONSTRAINT "empaques_id_ejecucion_fkey" FOREIGN KEY ("id_ejecucion") REFERENCES "fase_ejecuciones"("id_ejecucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empaques" ADD CONSTRAINT "empaques_id_lote_fkey" FOREIGN KEY ("id_lote") REFERENCES "lotes_produccion"("id_lote") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios" ADD CONSTRAINT "envios_id_unidad_fkey" FOREIGN KEY ("id_unidad") REFERENCES "unidades_trazables"("id_unidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios" ADD CONSTRAINT "envios_id_ejecucion_fkey" FOREIGN KEY ("id_ejecucion") REFERENCES "fase_ejecuciones"("id_ejecucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio_empaque" ADD CONSTRAINT "envio_empaque_id_envio_fkey" FOREIGN KEY ("id_envio") REFERENCES "envios"("id_envio") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio_empaque" ADD CONSTRAINT "envio_empaque_id_empaque_fkey" FOREIGN KEY ("id_empaque") REFERENCES "empaques"("id_empaque") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_blockchain" ADD CONSTRAINT "registros_blockchain_id_instancia_fkey" FOREIGN KEY ("id_instancia") REFERENCES "flujo_instancias"("id_instancia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_blockchain" ADD CONSTRAINT "registros_blockchain_id_transicion_fkey" FOREIGN KEY ("id_transicion") REFERENCES "transiciones_ejecucion"("id_transicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_referencia" ADD CONSTRAINT "documentos_referencia_id_evento_fkey" FOREIGN KEY ("id_evento") REFERENCES "eventos_trazabilidad"("id_evento") ON DELETE RESTRICT ON UPDATE CASCADE;
