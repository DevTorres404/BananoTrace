-- ============================================================
-- BananoTrace BI — Star Schema (SQL Views + Materialized Views)
-- Migration: 20260804000000_bi_star_schema_views
-- Strategy: Views on top of the operational schema (no data duplication).
--           fact_lotes and fact_envios are materialized for performance.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS analytics;

-- ── 1. dim_tiempo ────────────────────────────────────────────
-- Generates one row per calendar day from 2022-01-01 to 2030-12-31.
CREATE OR REPLACE VIEW analytics.dim_tiempo AS
SELECT
  TO_CHAR(d, 'YYYYMMDD')::int                        AS id_tiempo,
  d::date                                             AS fecha,
  EXTRACT(YEAR  FROM d)::int                          AS anio,
  'Q' || EXTRACT(QUARTER FROM d)::text               AS trimestre,
  EXTRACT(MONTH FROM d)::int                          AS mes,
  TO_CHAR(d, 'TMMonth')                               AS mes_nombre,
  EXTRACT(WEEK  FROM d)::int                          AS semana,
  TO_CHAR(d, 'TMDay')                                 AS dia_semana
FROM generate_series(
  '2022-01-01'::date,
  '2030-12-31'::date,
  '1 day'::interval
) AS g(d);

-- ── 2. dim_finca ─────────────────────────────────────────────
CREATE OR REPLACE VIEW analytics.dim_finca AS
SELECT
  f.id_finca,
  f.codigo_finca,
  f.nombre,
  f.pais,
  f.region,
  f.localidad,
  f.area_hectareas,
  f.id_productor,
  p.nombre_razon_social AS nombre_productor
FROM fincas f
JOIN productores p ON p.id_productor = f.id_productor
WHERE f.estado = true;

-- ── 3. dim_variedad ──────────────────────────────────────────
CREATE OR REPLACE VIEW analytics.dim_variedad AS
SELECT
  id_variedad,
  codigo,
  nombre
FROM variedades
WHERE activo = true;

-- ── 4. dim_puerto ────────────────────────────────────────────
CREATE OR REPLACE VIEW analytics.dim_puerto AS
SELECT
  id_puerto,
  codigo,
  nombre,
  pais_nombre
FROM puertos
WHERE activo = true;

-- ── 5. dim_estado_lote (lookup inline) ───────────────────────
CREATE OR REPLACE VIEW analytics.dim_estado_lote AS
SELECT * FROM (VALUES
  ('PLANIFICADO'::text,  'Pre-siembra',   1),
  ('EN_PRODUCCION',      'En campo',      2),
  ('COSECHADO',          'Post-cosecha',  3),
  ('EMPACADO',           'Empaque',       4),
  ('EXPORTADO',          'Exportado',     5),
  ('CERRADO',            'Cerrado',       6)
) AS t(estado, etapa, orden);

-- ── 6. fact_lotes (MATERIALIZED) ─────────────────────────────
-- One row per production lot. Aggregates quality controls and packaging.
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.fact_lotes AS
SELECT
  l.id_lote,
  l.id_finca,
  COALESCE(l.id_variedad, 0)                                    AS id_variedad,
  -- time keys (YYYYMMDD int)
  CASE WHEN l.fecha_siembra IS NOT NULL
    THEN TO_CHAR(l.fecha_siembra, 'YYYYMMDD')::int END          AS id_tiempo_siembra,
  CASE WHEN l.fecha_cosecha IS NOT NULL
    THEN TO_CHAR(l.fecha_cosecha, 'YYYYMMDD')::int END          AS id_tiempo_cosecha,
  l.estado::text                                                 AS estado,
  -- metrics
  COALESCE(l.cantidad_plantas, 0)                               AS cantidad_plantas,
  COALESCE(l.peso_cosechado_kg, 0)                              AS peso_cosechado_kg,
  CASE
    WHEN l.fecha_cosecha IS NOT NULL AND l.fecha_siembra IS NOT NULL
    THEN (l.fecha_cosecha - l.fecha_siembra)
    ELSE NULL
  END                                                            AS dias_ciclo,
  -- quality aggregates
  COUNT(cc.id_control)                                          AS n_controles_calidad,
  COALESCE(AVG(cc.porcentaje_rechazo), 0)                       AS pct_rechazo_prom,
  COALESCE(AVG(cc.calibre_mm), 0)                               AS calibre_prom_mm,
  -- last quality result
  (
    SELECT cc2.resultado::text
    FROM controles_calidad cc2
    WHERE cc2.id_lote = l.id_lote
    ORDER BY cc2.fecha_control DESC
    LIMIT 1
  )                                                             AS resultado_calidad,
  -- packaging aggregates
  COUNT(DISTINCT e.id_empaque)                                  AS n_cajas,
  COALESCE(SUM(e.peso_neto_kg), 0)                              AS peso_total_cajas_kg,
  -- first shipment FK (if any)
  (
    SELECT ee2.id_envio
    FROM empaques emp2
    JOIN envio_empaque ee2 ON ee2.id_empaque = emp2.id_empaque
    WHERE emp2.id_lote = l.id_lote
    LIMIT 1
  )                                                             AS id_envio,
  -- audit
  l.fecha_registro
FROM lotes_produccion l
LEFT JOIN controles_calidad cc ON cc.id_lote = l.id_lote
LEFT JOIN empaques e           ON e.id_lote  = l.id_lote
GROUP BY l.id_lote, l.id_finca, l.id_variedad, l.fecha_siembra,
         l.fecha_cosecha, l.estado, l.cantidad_plantas,
         l.peso_cosechado_kg, l.fecha_registro
WITH DATA;

-- Indexes for fact_lotes
CREATE INDEX IF NOT EXISTS idx_fact_lotes_finca    ON analytics.fact_lotes (id_finca);
CREATE INDEX IF NOT EXISTS idx_fact_lotes_variedad ON analytics.fact_lotes (id_variedad);
CREATE INDEX IF NOT EXISTS idx_fact_lotes_estado   ON analytics.fact_lotes (estado);
CREATE INDEX IF NOT EXISTS idx_fact_lotes_siembra  ON analytics.fact_lotes (id_tiempo_siembra);
CREATE INDEX IF NOT EXISTS idx_fact_lotes_cosecha  ON analytics.fact_lotes (id_tiempo_cosecha);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_lotes_pk ON analytics.fact_lotes (id_lote);

-- ── 7. fact_envios (MATERIALIZED) ────────────────────────────
-- One row per shipment (container). Aggregates boxes and weight.
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.fact_envios AS
SELECT
  e.id_envio,
  CASE WHEN e.fecha_salida IS NOT NULL
    THEN TO_CHAR(e.fecha_salida, 'YYYYMMDD')::int END           AS id_tiempo_salida,
  e.id_puerto_origen,
  e.id_puerto_destino,
  COALESCE(e.id_naviera, 0)                                     AS id_naviera,
  e.estado::text                                                 AS estado,
  COALESCE(e.temperatura_salida, 0)                             AS temperatura_salida,
  -- aggregates
  COUNT(ee.id_empaque)                                          AS n_cajas,
  COALESCE(SUM(emp.peso_neto_kg), 0)                            AS peso_total_kg,
  CASE
    WHEN e.fecha_estimada_llegada IS NOT NULL AND e.fecha_salida IS NOT NULL
    THEN EXTRACT(EPOCH FROM (e.fecha_estimada_llegada - e.fecha_salida)) / 86400.0
    ELSE NULL
  END                                                            AS dias_transito,
  -- audit
  e.fecha_salida
FROM envios e
LEFT JOIN envio_empaque ee  ON ee.id_envio    = e.id_envio
LEFT JOIN empaques emp      ON emp.id_empaque = ee.id_empaque
GROUP BY e.id_envio, e.fecha_salida, e.id_puerto_origen,
         e.id_puerto_destino, e.id_naviera, e.estado,
         e.temperatura_salida, e.fecha_estimada_llegada
WITH DATA;

-- Indexes for fact_envios
CREATE INDEX IF NOT EXISTS idx_fact_envios_salida   ON analytics.fact_envios (id_tiempo_salida);
CREATE INDEX IF NOT EXISTS idx_fact_envios_origen   ON analytics.fact_envios (id_puerto_origen);
CREATE INDEX IF NOT EXISTS idx_fact_envios_destino  ON analytics.fact_envios (id_puerto_destino);
CREATE INDEX IF NOT EXISTS idx_fact_envios_naviera  ON analytics.fact_envios (id_naviera);
CREATE INDEX IF NOT EXISTS idx_fact_envios_estado   ON analytics.fact_envios (estado);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_envios_pk ON analytics.fact_envios (id_envio);
