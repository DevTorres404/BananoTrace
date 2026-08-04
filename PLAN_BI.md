# Plan de BI — Modelo Estrella + Dashboards (BananoTrace)

## Contexto

El sistema ya tiene ~1.5M de registros sembrados a través de los seeders de volumen. La data cubre 4 años (2023–2026) con estacionalidad, tendencias y outliers realistas. El objetivo es construir un módulo de BI analítico que consuma esa data y la presente en dashboards visuales.

---

## Modelo Estrella Propuesto

El modelo estrella se construye como **vistas SQL** encima del esquema operacional de Prisma, sin crear tablas nuevas (evitamos duplicación de datos y mantemos un solo source of truth).

### 🌟 Tabla de Hechos Central: `fact_lotes`

Cada fila = un lote de producción. Todas las métricas cuantitativas del negocio se derivan de aquí.

| Columna               | Tipo     | Fuente                             | Descripción                          |
|-----------------------|----------|------------------------------------|--------------------------------------|
| `id_lote`             | BigInt   | `lotes_produccion`                 | PK del hecho                         |
| `id_finca`            | BigInt   | `lotes_produccion`                 | FK → dim_finca                       |
| `id_variedad`         | Int      | `lotes_produccion`                 | FK → dim_variedad                    |
| `id_tiempo_siembra`   | Int      | derivado de `fecha_siembra`        | FK → dim_tiempo                      |
| `id_tiempo_cosecha`   | Int      | derivado de `fecha_cosecha`        | FK → dim_tiempo                      |
| `estado`              | Enum     | `lotes_produccion`                 | FK → dim_estado_lote                 |
| `cantidad_plantas`    | Int      | `lotes_produccion`                 | Métrica: plantas por lote            |
| `peso_cosechado_kg`   | Decimal  | `lotes_produccion`                 | Métrica: tonelaje cosechado          |
| `dias_ciclo`          | Int      | calculado (cosecha - siembra)      | Métrica: duración del ciclo          |
| `n_controles_calidad` | Int      | COUNT de `controles_calidad`       | Métrica: inspecciones por lote       |
| `pct_rechazo_prom`    | Decimal  | AVG de `porcentaje_rechazo`        | Métrica: tasa de rechazo promedio    |
| `resultado_calidad`   | Enum     | último `resultado` en controles    | Aprobado / Observado / Rechazado     |
| `n_cajas`             | Int      | COUNT de `empaques`                | Métrica: cajas generadas             |
| `peso_total_cajas_kg` | Decimal  | SUM de `peso_neto_kg` (empaques)   | Métrica: kg empacados                |
| `id_envio`            | BigInt   | JOIN envio_empaque → envios        | FK → fact_envios (si aplica)         |

### 📐 Dimensiones

#### `dim_tiempo`
Generada a partir de las fechas del sistema. Permite análisis por año/trimestre/mes/semana.

| Columna       | Ejemplo          |
|---------------|------------------|
| `id_tiempo`   | 20260801         |
| `fecha`       | 2026-08-01       |
| `anio`        | 2026             |
| `trimestre`   | Q3               |
| `mes`         | 8                |
| `mes_nombre`  | Agosto           |
| `semana`      | 31               |
| `dia_semana`  | Domingo          |

#### `dim_finca`

| Columna               |
|-----------------------|
| `id_finca`            |
| `codigo_finca`        |
| `nombre`              |
| `pais`                |
| `region`              |
| `localidad`           |
| `area_hectareas`      |
| `id_productor`        |
| `nombre_productor`    |

#### `dim_variedad`

| Columna     |
|-------------|
| `id_variedad` |
| `codigo`    |
| `nombre`    |

#### `dim_estado_lote` (tabla de lookup pequeña)

| Columna    | Ejemplo         |
|------------|-----------------|
| `estado`   | EXPORTADO       |
| `etapa`    | Post-cosecha    |
| `orden`    | 5               |

#### `dim_puerto` (origen y destino de envíos)

| Columna       |
|---------------|
| `id_puerto`   |
| `codigo`      |
| `nombre`      |
| `pais_nombre` |

---

### 🌟 Tabla de Hechos Secundaria: `fact_envios`

Cada fila = un envío (contenedor). Métricas logísticas y de exportación.

| Columna                | Fuente                              |
|------------------------|-------------------------------------|
| `id_envio`             | `envios`                            |
| `id_tiempo_salida`     | derivado de `fecha_salida`          |
| `id_puerto_origen`     | `envios`                            |
| `id_puerto_destino`    | `envios`                            |
| `id_naviera`           | `envios`                            |
| `estado`               | `envios`                            |
| `temperatura_salida`   | `envios`                            |
| `n_cajas`              | COUNT de `envio_empaque`            |
| `peso_total_kg`        | SUM peso_neto_kg de cajas incluidas |
| `dias_transito`        | calculado (llegada - salida)        |

---

## Dashboards a Construir

Se construirán como una **nueva ruta en el frontend Angular** (`/analytics`) con acceso solo para Administrador y Gerente Productor.

### Dashboard 1 — Producción Agrícola
**Audiencia**: Gerente Productor, Administrador  
**KPIs principales**:
- Total de lotes por estado (tarjetas)
- Tonelaje cosechado acumulado (por mes/trimestre)
- Distribución de lotes por variedad (donut)
- Lotes activos vs cerrados por finca (barras apiladas)
- Mapa de calor: volumen de cosecha por mes x año

### Dashboard 2 — Control de Calidad
**Audiencia**: Calidad, Gerente, Administrador  
**KPIs principales**:
- Tasa de aprobación/observación/rechazo (gauge)
- Evolución del % de rechazo promedio por mes (línea)
- Calibre promedio por variedad (barras horizontales)
- Top 10 fincas con mayor tasa de rechazo

### Dashboard 3 — Logística y Exportación
**Audiencia**: Logística, Gerente, Administrador  
**KPIs principales**:
- Envíos por estado (tarjetas)
- Volumen exportado por ruta (origen → destino) (barras)
- Top navieras por volumen (donut)
- Temperatura de salida promedio por mes (línea)
- Días de tránsito promedio por ruta

### Dashboard 4 — Resumen Ejecutivo
**Audiencia**: Administrador  
**KPIs principales**: Todos los anteriores combinados en una sola vista de alto nivel con tendencias YoY (year-over-year).

---

## Estrategia Técnica

### Backend
- Crear un `AnalyticsModule` con endpoints dedicados:
  - `GET /analytics/produccion` 
  - `GET /analytics/calidad`
  - `GET /analytics/logistica`
  - `GET /analytics/resumen`
- Cada endpoint ejecuta **queries SQL raw** con `prisma.$queryRaw` para aprovechar agregaciones nativas de Postgres (mucho más eficiente que cargar data al ORM y agregar en JS).
- Los endpoints aceptan query params: `desde`, `hasta`, `idFinca`, `idVariedad`, `pais`.

### Frontend
- Nueva página `analytics-page` con 4 tabs (uno por dashboard).
- Librería de gráficos: **Chart.js** (ya liviana, sin dependencias pesadas como D3 o ECharts) con wrappers Angular.
- Componentes: `kpi-card`, `bar-chart`, `line-chart`, `donut-chart`, `heatmap-chart`.

---

## Open Questions

> [!IMPORTANT]
> ¿Los dashboards los ven **solo Admin + Gerente Productor**, o también Calidad y Logística (cada uno solo su dashboard)?

> [!IMPORTANT]
> ¿Querés filtros de fecha globales en cada dashboard (rango libre) o solo predefinidos (últimos 30 días / últimos 3 meses / Este año)?

> [!NOTE]
> Para los gráficos, ¿ya tenés Chart.js instalado en el frontend o lo instalamos ahora?

---

## Verification Plan

### Automated
- Verificar que los endpoints de analytics respondan con datos correctos y en menos de 500ms en la BD sembrada.

### Manual
- Revisar que los gráficos rendericen correctamente en modo claro y oscuro.
- Confirmar que los filtros de fecha y finca funcionen y afecten todos los widgets del dashboard.
