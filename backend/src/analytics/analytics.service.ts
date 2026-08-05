import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { Prisma } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Scope helper ────────────────────────────────────────────────────────────
  private farmScope(actor: AuthenticatedUser) {
    if (
      actor.idRol === ROLE_IDS.SUPERVISOR_AGRICOLA ||
      actor.idRol === ROLE_IDS.GERENTE_PRODUCTOR
    ) {
      if (actor.idProductor) {
        return Prisma.raw(`AND f.id_productor = ${BigInt(actor.idProductor)}`);
      }
      return Prisma.raw(`AND false`); // no access
    }
    return Prisma.empty; // admin sees all
  }

  private parseRange(desde?: string, hasta?: string) {
    const d = desde ? new Date(desde) : new Date('2023-01-01');
    const h = hasta ? new Date(hasta) : new Date();
    return { d, h };
  }

  // ── Dashboard 1: Producción ─────────────────────────────────────────────────
  async produccion(
    actor: AuthenticatedUser,
    query: Record<string, string | undefined>,
  ) {
    const scope = this.farmScope(actor);
    const { d, h } = this.parseRange(query.desde, query.hasta);

    const [kpis, porEstado, porVariedad, tendencia, topFincas] =
      await Promise.all([
        // KPIs generales
        this.prisma.$queryRaw<
          { total_lotes: bigint; total_plantas: bigint; total_kg: number; dias_ciclo_prom: number }[]
        >`
          SELECT
            COUNT(l.id_lote)::bigint AS total_lotes,
            COALESCE(SUM(l.cantidad_plantas), 0)::bigint AS total_plantas,
            COALESCE(SUM(l.peso_cosechado_kg), 0)::float AS total_kg,
            COALESCE(AVG(
              CASE WHEN l.fecha_cosecha IS NOT NULL AND l.fecha_siembra IS NOT NULL
                THEN (l.fecha_cosecha - l.fecha_siembra)
              END
            ), 0)::float AS dias_ciclo_prom
          FROM lotes_produccion l
          JOIN fincas f ON f.id_finca = l.id_finca
          WHERE l.fecha_registro BETWEEN ${d} AND ${h}
          ${scope}
        `,

        // Lotes por estado
        this.prisma.$queryRaw<{ estado: string; cantidad: bigint }[]>`
          SELECT l.estado::text, COUNT(*)::bigint AS cantidad
          FROM lotes_produccion l
          JOIN fincas f ON f.id_finca = l.id_finca
          WHERE l.fecha_registro BETWEEN ${d} AND ${h}
          ${scope}
          GROUP BY l.estado
          ORDER BY cantidad DESC
        `,

        // Lotes por variedad
        this.prisma.$queryRaw<{ variedad: string; cantidad: bigint; peso_total_kg: number }[]>`
          SELECT
            COALESCE(v.nombre, 'Sin variedad') AS variedad,
            COUNT(l.id_lote)::bigint AS cantidad,
            COALESCE(SUM(l.peso_cosechado_kg), 0)::float AS peso_total_kg
          FROM lotes_produccion l
          JOIN fincas f ON f.id_finca = l.id_finca
          LEFT JOIN variedades v ON v.id_variedad = l.id_variedad
          WHERE l.fecha_registro BETWEEN ${d} AND ${h}
          ${scope}
          GROUP BY v.nombre
          ORDER BY cantidad DESC
          LIMIT 10
        `,

        // Tendencia mensual de cosecha (kg por mes). Filtra por fecha_registro, igual que
        // los KPIs y topFincas más abajo — antes filtraba por fecha_cosecha, así que para
        // el mismo rango seleccionado el total de este gráfico podía no tener relación
        // alguna con "Total cosechado" del KPI (mismo período, sumas completamente distintas).
        this.prisma.$queryRaw<{ anio: number; mes: number; lotes: bigint; kg: number }[]>`
          SELECT
            EXTRACT(YEAR FROM l.fecha_cosecha)::int AS anio,
            EXTRACT(MONTH FROM l.fecha_cosecha)::int AS mes,
            COUNT(l.id_lote)::bigint AS lotes,
            COALESCE(SUM(l.peso_cosechado_kg), 0)::float AS kg
          FROM lotes_produccion l
          JOIN fincas f ON f.id_finca = l.id_finca
          WHERE l.fecha_cosecha IS NOT NULL
            AND l.fecha_registro BETWEEN ${d} AND ${h}
            ${scope}
          GROUP BY anio, mes
          ORDER BY anio, mes
        `,

        // Top 10 fincas por volumen cosechado
        this.prisma.$queryRaw<{ finca: string; pais: string; lotes: bigint; kg: number }[]>`
          SELECT
            f.nombre AS finca,
            f.pais,
            COUNT(l.id_lote)::bigint AS lotes,
            COALESCE(SUM(l.peso_cosechado_kg), 0)::float AS kg
          FROM lotes_produccion l
          JOIN fincas f ON f.id_finca = l.id_finca
          WHERE l.fecha_cosecha IS NOT NULL
            AND l.fecha_registro BETWEEN ${d} AND ${h}
            ${scope}
          GROUP BY f.id_finca, f.nombre, f.pais
          ORDER BY kg DESC
          LIMIT 10
        `,
      ]);

    const kpi = kpis[0] ?? { total_lotes: 0n, total_plantas: 0n, total_kg: 0, dias_ciclo_prom: 0 };
    return {
      kpis: {
        totalLotes: Number(kpi.total_lotes),
        totalPlantas: Number(kpi.total_plantas),
        totalKg: Number(kpi.total_kg),
        diasCicloProm: Math.round(Number(kpi.dias_ciclo_prom)),
      },
      porEstado: porEstado.map((r) => ({ estado: r.estado, cantidad: Number(r.cantidad) })),
      porVariedad: porVariedad.map((r) => ({
        variedad: r.variedad,
        cantidad: Number(r.cantidad),
        pesoKg: Number(r.peso_total_kg),
      })),
      tendencia: tendencia.map((r) => ({
        anio: r.anio,
        mes: r.mes,
        lotes: Number(r.lotes),
        kg: Number(r.kg),
      })),
      topFincas: topFincas.map((r) => ({
        finca: r.finca,
        pais: r.pais,
        lotes: Number(r.lotes),
        kg: Number(r.kg),
      })),
    };
  }

  // ── Dashboard 2: Calidad ────────────────────────────────────────────────────
  async calidad(
    actor: AuthenticatedUser,
    query: Record<string, string | undefined>,
  ) {
    const scope = this.farmScope(actor);
    const { d, h } = this.parseRange(query.desde, query.hasta);

    const [kpis, porResultado, tendenciaRechazo, porVariedad, topRechazadas] =
      await Promise.all([
        // KPIs
        this.prisma.$queryRaw<{
          total_controles: bigint;
          aprobados: bigint;
          observados: bigint;
          rechazados: bigint;
          pct_rechazo_prom: number;
          calibre_prom: number;
        }[]>`
          SELECT
            COUNT(*)::bigint AS total_controles,
            COUNT(*) FILTER (WHERE cc.resultado = 'APROBADO')::bigint AS aprobados,
            COUNT(*) FILTER (WHERE cc.resultado = 'OBSERVADO')::bigint AS observados,
            COUNT(*) FILTER (WHERE cc.resultado = 'RECHAZADO')::bigint AS rechazados,
            COALESCE(AVG(cc.porcentaje_rechazo), 0)::float AS pct_rechazo_prom,
            COALESCE(AVG(cc.calibre_mm), 0)::float AS calibre_prom
          FROM controles_calidad cc
          JOIN lotes_produccion l ON l.id_lote = cc.id_lote
          JOIN fincas f ON f.id_finca = l.id_finca
          WHERE cc.fecha_control BETWEEN ${d} AND ${h}
          ${scope}
        `,

        // Distribución por resultado
        this.prisma.$queryRaw<{ resultado: string; cantidad: bigint }[]>`
          SELECT cc.resultado::text, COUNT(*)::bigint AS cantidad
          FROM controles_calidad cc
          JOIN lotes_produccion l ON l.id_lote = cc.id_lote
          JOIN fincas f ON f.id_finca = l.id_finca
          WHERE cc.fecha_control BETWEEN ${d} AND ${h}
          ${scope}
          GROUP BY cc.resultado
        `,

        // Tendencia mensual de % rechazo
        this.prisma.$queryRaw<{ anio: number; mes: number; pct_rechazo: number; controles: bigint }[]>`
          SELECT
            EXTRACT(YEAR FROM cc.fecha_control)::int AS anio,
            EXTRACT(MONTH FROM cc.fecha_control)::int AS mes,
            COALESCE(AVG(cc.porcentaje_rechazo), 0)::float AS pct_rechazo,
            COUNT(*)::bigint AS controles
          FROM controles_calidad cc
          JOIN lotes_produccion l ON l.id_lote = cc.id_lote
          JOIN fincas f ON f.id_finca = l.id_finca
          WHERE cc.fecha_control BETWEEN ${d} AND ${h}
          ${scope}
          GROUP BY anio, mes
          ORDER BY anio, mes
        `,

        // Calibre promedio por variedad
        this.prisma.$queryRaw<{ variedad: string; calibre_prom: number; cantidad: bigint }[]>`
          SELECT
            COALESCE(v.nombre, 'Sin variedad') AS variedad,
            AVG(cc.calibre_mm)::float AS calibre_prom,
            COUNT(*)::bigint AS cantidad
          FROM controles_calidad cc
          JOIN lotes_produccion l ON l.id_lote = cc.id_lote
          JOIN fincas f ON f.id_finca = l.id_finca
          LEFT JOIN variedades v ON v.id_variedad = l.id_variedad
          WHERE cc.fecha_control BETWEEN ${d} AND ${h}
            AND cc.calibre_mm IS NOT NULL
            ${scope}
          GROUP BY v.nombre
          ORDER BY calibre_prom DESC
          LIMIT 10
        `,

        // Top 10 fincas con mayor tasa de rechazo
        this.prisma.$queryRaw<{ finca: string; pais: string; pct_rechazo: number; rechazados: bigint; total: bigint }[]>`
          SELECT
            f.nombre AS finca,
            f.pais,
            AVG(cc.porcentaje_rechazo)::float AS pct_rechazo,
            COUNT(*) FILTER (WHERE cc.resultado = 'RECHAZADO')::bigint AS rechazados,
            COUNT(*)::bigint AS total
          FROM controles_calidad cc
          JOIN lotes_produccion l ON l.id_lote = cc.id_lote
          JOIN fincas f ON f.id_finca = l.id_finca
          WHERE cc.fecha_control BETWEEN ${d} AND ${h}
          ${scope}
          GROUP BY f.id_finca, f.nombre, f.pais
          HAVING COUNT(*) >= 3
          ORDER BY pct_rechazo DESC
          LIMIT 10
        `,
      ]);

    const kpi = kpis[0] ?? {
      total_controles: 0n, aprobados: 0n, observados: 0n, rechazados: 0n,
      pct_rechazo_prom: 0, calibre_prom: 0,
    };

    return {
      kpis: {
        totalControles: Number(kpi.total_controles),
        aprobados: Number(kpi.aprobados),
        observados: Number(kpi.observados),
        rechazados: Number(kpi.rechazados),
        tasaAprobacion: kpi.total_controles > 0n
          ? Math.round((Number(kpi.aprobados) / Number(kpi.total_controles)) * 100)
          : 0,
        pctRechazoProm: Number(kpi.pct_rechazo_prom).toFixed(2),
        calibreProm: Number(kpi.calibre_prom).toFixed(2),
      },
      porResultado: porResultado.map((r) => ({ resultado: r.resultado, cantidad: Number(r.cantidad) })),
      tendenciaRechazo: tendenciaRechazo.map((r) => ({
        anio: r.anio, mes: r.mes,
        pctRechazo: Number(r.pct_rechazo).toFixed(2),
        controles: Number(r.controles),
      })),
      porVariedad: porVariedad.map((r) => ({
        variedad: r.variedad,
        calibreProm: Number(r.calibre_prom).toFixed(2),
        cantidad: Number(r.cantidad),
      })),
      topRechazadas: topRechazadas.map((r) => ({
        finca: r.finca,
        pais: r.pais,
        pctRechazo: Number(r.pct_rechazo).toFixed(2),
        rechazados: Number(r.rechazados),
        total: Number(r.total),
      })),
    };
  }

  // ── Dashboard 3: Logística ──────────────────────────────────────────────────
  async logistica(
    actor: AuthenticatedUser,
    query: Record<string, string | undefined>,
  ) {
    const { d, h } = this.parseRange(query.desde, query.hasta);

    const [kpis, porEstado, porNaviera, rutas, tendencia] = await Promise.all([
      // KPIs
      this.prisma.$queryRaw<{
        total_envios: bigint;
        total_cajas: bigint;
        total_kg: number;
        temp_prom: number;
        dias_transito_prom: number;
      }[]>`
        SELECT
          COUNT(DISTINCT e.id_envio)::bigint AS total_envios,
          COUNT(ee.id_empaque)::bigint AS total_cajas,
          COALESCE(SUM(emp.peso_neto_kg), 0)::float AS total_kg,
          COALESCE(AVG(e.temperatura_salida), 0)::float AS temp_prom,
          COALESCE(AVG(
            CASE WHEN e.fecha_estimada_llegada IS NOT NULL AND e.fecha_salida IS NOT NULL
              THEN EXTRACT(EPOCH FROM (e.fecha_estimada_llegada - e.fecha_salida)) / 86400
            END
          ), 0)::float AS dias_transito_prom
        FROM envios e
        LEFT JOIN envio_empaque ee ON ee.id_envio = e.id_envio
        LEFT JOIN empaques emp ON emp.id_empaque = ee.id_empaque
        WHERE e.fecha_salida BETWEEN ${d} AND ${h}
      `,

      // Envíos por estado
      this.prisma.$queryRaw<{ estado: string; cantidad: bigint }[]>`
        SELECT e.estado::text, COUNT(*)::bigint AS cantidad
        FROM envios e
        WHERE e.fecha_salida BETWEEN ${d} AND ${h}
        GROUP BY e.estado
        ORDER BY cantidad DESC
      `,

      // Top navieras por volumen
      this.prisma.$queryRaw<{ naviera: string; envios: bigint; kg: number }[]>`
        SELECT
          COALESCE(n.nombre, 'Sin naviera') AS naviera,
          COUNT(DISTINCT e.id_envio)::bigint AS envios,
          COALESCE(SUM(emp.peso_neto_kg), 0)::float AS kg
        FROM envios e
        LEFT JOIN navieras n ON n.id_naviera = e.id_naviera
        LEFT JOIN envio_empaque ee ON ee.id_envio = e.id_envio
        LEFT JOIN empaques emp ON emp.id_empaque = ee.id_empaque
        WHERE e.fecha_salida BETWEEN ${d} AND ${h}
        GROUP BY n.nombre
        ORDER BY kg DESC
        LIMIT 8
      `,

      // Top rutas por volumen
      this.prisma.$queryRaw<{ origen: string; destino: string; envios: bigint; kg: number }[]>`
        SELECT
          po.nombre AS origen,
          pd.nombre AS destino,
          COUNT(DISTINCT e.id_envio)::bigint AS envios,
          COALESCE(SUM(emp.peso_neto_kg), 0)::float AS kg
        FROM envios e
        JOIN puertos po ON po.id_puerto = e.id_puerto_origen
        JOIN puertos pd ON pd.id_puerto = e.id_puerto_destino
        LEFT JOIN envio_empaque ee ON ee.id_envio = e.id_envio
        LEFT JOIN empaques emp ON emp.id_empaque = ee.id_empaque
        WHERE e.fecha_salida BETWEEN ${d} AND ${h}
        GROUP BY po.nombre, pd.nombre
        ORDER BY kg DESC
        LIMIT 10
      `,

      // Tendencia mensual de envíos
      this.prisma.$queryRaw<{ anio: number; mes: number; envios: bigint; kg: number }[]>`
        SELECT
          EXTRACT(YEAR FROM e.fecha_salida)::int AS anio,
          EXTRACT(MONTH FROM e.fecha_salida)::int AS mes,
          COUNT(DISTINCT e.id_envio)::bigint AS envios,
          COALESCE(SUM(emp.peso_neto_kg), 0)::float AS kg
        FROM envios e
        LEFT JOIN envio_empaque ee ON ee.id_envio = e.id_envio
        LEFT JOIN empaques emp ON emp.id_empaque = ee.id_empaque
        WHERE e.fecha_salida BETWEEN ${d} AND ${h}
        GROUP BY anio, mes
        ORDER BY anio, mes
      `,
    ]);

    const kpi = kpis[0] ?? { total_envios: 0n, total_cajas: 0n, total_kg: 0, temp_prom: 0, dias_transito_prom: 0 };
    return {
      kpis: {
        totalEnvios: Number(kpi.total_envios),
        totalCajas: Number(kpi.total_cajas),
        totalKg: Number(kpi.total_kg),
        tempProm: Number(kpi.temp_prom).toFixed(1),
        diasTransitoProm: Math.round(Number(kpi.dias_transito_prom)),
      },
      porEstado: porEstado.map((r) => ({ estado: r.estado, cantidad: Number(r.cantidad) })),
      porNaviera: porNaviera.map((r) => ({ naviera: r.naviera, envios: Number(r.envios), kg: Number(r.kg) })),
      rutas: rutas.map((r) => ({ origen: r.origen, destino: r.destino, envios: Number(r.envios), kg: Number(r.kg) })),
      tendencia: tendencia.map((r) => ({ anio: r.anio, mes: r.mes, envios: Number(r.envios), kg: Number(r.kg) })),
    };
  }

  // ── Dashboard 4: Resumen Ejecutivo ──────────────────────────────────────────
  async resumen(
    actor: AuthenticatedUser,
    query: Record<string, string | undefined>,
  ) {
    const { d, h } = this.parseRange(query.desde, query.hasta);

    const [produccionKpi, calidadKpi, logisticaKpi, actividadReciente] =
      await Promise.all([
        this.prisma.$queryRaw<{ total_lotes: bigint; total_kg: number; lotes_activos: bigint }[]>`
          SELECT
            COUNT(*)::bigint AS total_lotes,
            COALESCE(SUM(peso_cosechado_kg), 0)::float AS total_kg,
            COUNT(*) FILTER (WHERE estado NOT IN ('CERRADO'))::bigint AS lotes_activos
          FROM lotes_produccion
          WHERE fecha_registro BETWEEN ${d} AND ${h}
        `,
        this.prisma.$queryRaw<{ aprobados: bigint; rechazados: bigint; pct_rechazo: number }[]>`
          SELECT
            COUNT(*) FILTER (WHERE resultado = 'APROBADO')::bigint AS aprobados,
            COUNT(*) FILTER (WHERE resultado = 'RECHAZADO')::bigint AS rechazados,
            COALESCE(AVG(porcentaje_rechazo), 0)::float AS pct_rechazo
          FROM controles_calidad
          WHERE fecha_control BETWEEN ${d} AND ${h}
        `,
        this.prisma.$queryRaw<{ total_envios: bigint; entregados: bigint; total_kg: number }[]>`
          SELECT
            COUNT(DISTINCT e.id_envio)::bigint AS total_envios,
            COUNT(DISTINCT e.id_envio) FILTER (WHERE e.estado = 'ENTREGADO')::bigint AS entregados,
            COALESCE(SUM(emp.peso_neto_kg), 0)::float AS total_kg
          FROM envios e
          LEFT JOIN envio_empaque ee ON ee.id_envio = e.id_envio
          LEFT JOIN empaques emp ON emp.id_empaque = ee.id_empaque
          WHERE e.fecha_salida BETWEEN ${d} AND ${h}
        `,
        // Actividad reciente, un punto por mes dentro del rango seleccionado. Antes el
        // rango de meses estaba fijo a "últimos 6 meses" sin importar el filtro de fecha
        // elegido arriba — los KPIs de esta misma pestaña sí respetaban el filtro, así que
        // este gráfico terminaba mostrando una ventana de tiempo distinta a la del resto
        // de la pantalla.
        this.prisma.$queryRaw<{ anio: number; mes: number; lotes: bigint; kg_cosechado: number; envios: bigint }[]>`
          SELECT
            EXTRACT(YEAR FROM m.mes)::int AS anio,
            EXTRACT(MONTH FROM m.mes)::int AS mes,
            COUNT(DISTINCT l.id_lote)::bigint AS lotes,
            COALESCE(SUM(l.peso_cosechado_kg), 0)::float AS kg_cosechado,
            COUNT(DISTINCT e.id_envio)::bigint AS envios
          FROM generate_series(
            date_trunc('month', ${d}::timestamp),
            date_trunc('month', ${h}::timestamp),
            INTERVAL '1 month'
          ) AS m(mes)
          LEFT JOIN lotes_produccion l ON date_trunc('month', l.fecha_cosecha) = m.mes
          LEFT JOIN envios e ON date_trunc('month', e.fecha_salida) = m.mes
          GROUP BY m.mes
          ORDER BY m.mes
        `,
      ]);

    const pk = produccionKpi[0] ?? { total_lotes: 0n, total_kg: 0, lotes_activos: 0n };
    const ck = calidadKpi[0] ?? { aprobados: 0n, rechazados: 0n, pct_rechazo: 0 };
    const lk = logisticaKpi[0] ?? { total_envios: 0n, entregados: 0n, total_kg: 0 };

    return {
      produccion: {
        totalLotes: Number(pk.total_lotes),
        totalKg: Number(pk.total_kg),
        lotesActivos: Number(pk.lotes_activos),
      },
      calidad: {
        aprobados: Number(ck.aprobados),
        rechazados: Number(ck.rechazados),
        pctRechazo: Number(ck.pct_rechazo).toFixed(2),
      },
      logistica: {
        totalEnvios: Number(lk.total_envios),
        entregados: Number(lk.entregados),
        totalKg: Number(lk.total_kg),
      },
      actividadReciente: actividadReciente.map((r) => ({
        anio: r.anio,
        mes: r.mes,
        lotes: Number(r.lotes),
        kgCosechado: Number(r.kg_cosechado),
        envios: Number(r.envios),
      })),
    };
  }
}
