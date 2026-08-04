import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import {
  AnalyticsFilters,
  AnalyticsService,
  CalidadResponse,
  LogisticaResponse,
  ProduccionResponse,
  ResumenResponse,
} from '../analytics.service';

Chart.register(...registerables);

export type AnalyticsTab = 'resumen' | 'produccion' | 'calidad' | 'logistica';

const MES_LABELS = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analytics-page.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './analytics-page.css'],
})
export class AnalyticsPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  // ── Refs for chart canvases ─────────────────────────────────────────────────
  @ViewChild('chartActividad') chartActividadRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartTendenciaKg') chartTendenciaKgRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartEstados') chartEstadosRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartRechazo') chartRechazoRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartNavieras') chartNavierasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartEnviosTendencia') chartEnviosTendenciaRef!: ElementRef<HTMLCanvasElement>;

  // ── State ───────────────────────────────────────────────────────────────────
  activeTab: AnalyticsTab = 'resumen';
  loadedTabs = new Set<AnalyticsTab>();

  filters: AnalyticsFilters = {};
  preset = '365';

  isLoadingResumen = false;
  isLoadingProduccion = false;
  isLoadingCalidad = false;
  isLoadingLogistica = false;
  isRefreshingEtl = false;

  errorResumen = '';
  errorProduccion = '';
  errorCalidad = '';
  errorLogistica = '';
  etlResult: { durationMs: number; views: { name: string; rowCount: number }[] } | null = null;
  etlError = '';

  resumen: ResumenResponse | null = null;
  produccion: ProduccionResponse | null = null;
  calidad: CalidadResponse | null = null;
  logistica: LogisticaResponse | null = null;

  private charts: Chart[] = [];

  // ── Auth ────────────────────────────────────────────────────────────────────
  get isAdmin(): boolean {
    return this.authService.currentUser()?.idRol === ROLE_IDS.ADMINISTRADOR;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.applyPreset('365');
  }

  ngAfterViewInit(): void {
    // Charts are rendered after tab switch triggers cdr.detectChanges()
  }

  ngOnDestroy(): void {
    this.destroyAllCharts();
  }

  // ── Tab switching ────────────────────────────────────────────────────────────
  switchTab(tab: AnalyticsTab): void {
    this.activeTab = tab;
    this.destroyAllCharts();
    this.loadTab(tab);
  }

  private loadTab(tab: AnalyticsTab): void {
    switch (tab) {
      case 'resumen':    return this.loadResumen();
      case 'produccion': return this.loadProduccion();
      case 'calidad':    return this.loadCalidad();
      case 'logistica':  return this.loadLogistica();
    }
  }

  // ── Preset dates ─────────────────────────────────────────────────────────────
  applyPreset(days: string): void {
    this.preset = days;
    const until = new Date();
    const from  = new Date();
    from.setDate(from.getDate() - Number(days));
    this.filters = {
      desde: from.toISOString().split('T')[0],
      hasta: until.toISOString().split('T')[0],
    };
    this.loadedTabs.clear();
    this.destroyAllCharts();
    this.loadTab(this.activeTab);
  }

  applyCustomRange(): void {
    this.preset = '';
    this.loadedTabs.clear();
    this.destroyAllCharts();
    this.loadTab(this.activeTab);
  }

  // ── Loaders ─────────────────────────────────────────────────────────────────
  loadResumen(): void {
    this.isLoadingResumen = true;
    this.errorResumen = '';
    this.analyticsService.resumen(this.filters)
      .pipe(finalize(() => { this.isLoadingResumen = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (data) => {
          this.resumen = data;
          this.loadedTabs.add('resumen');
          setTimeout(() => this.renderChartActividad(), 0);
        },
        error: (e) => { this.errorResumen = e.error?.message ?? 'Error al cargar resumen.'; },
      });
  }

  loadProduccion(): void {
    this.isLoadingProduccion = true;
    this.errorProduccion = '';
    this.analyticsService.produccion(this.filters)
      .pipe(finalize(() => { this.isLoadingProduccion = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (data) => {
          this.produccion = data;
          this.loadedTabs.add('produccion');
          setTimeout(() => { this.renderChartTendenciaKg(); this.renderChartEstados(); }, 0);
        },
        error: (e) => { this.errorProduccion = e.error?.message ?? 'Error al cargar producción.'; },
      });
  }

  loadCalidad(): void {
    this.isLoadingCalidad = true;
    this.errorCalidad = '';
    this.analyticsService.calidad(this.filters)
      .pipe(finalize(() => { this.isLoadingCalidad = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (data) => {
          this.calidad = data;
          this.loadedTabs.add('calidad');
          setTimeout(() => this.renderChartRechazo(), 0);
        },
        error: (e) => { this.errorCalidad = e.error?.message ?? 'Error al cargar calidad.'; },
      });
  }

  loadLogistica(): void {
    this.isLoadingLogistica = true;
    this.errorLogistica = '';
    this.analyticsService.logistica(this.filters)
      .pipe(finalize(() => { this.isLoadingLogistica = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (data) => {
          this.logistica = data;
          this.loadedTabs.add('logistica');
          setTimeout(() => { this.renderChartNavieras(); this.renderChartEnviosTendencia(); }, 0);
        },
        error: (e) => { this.errorLogistica = e.error?.message ?? 'Error al cargar logística.'; },
      });
  }

  // ── ETL ──────────────────────────────────────────────────────────────────────
  refreshEtl(): void {
    this.isRefreshingEtl = true;
    this.etlResult = null;
    this.etlError = '';
    this.analyticsService.etlRefresh()
      .pipe(finalize(() => { this.isRefreshingEtl = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (result) => { this.etlResult = result; },
        error: (e) => { this.etlError = e.error?.message ?? 'Error al refrescar ETL.'; },
      });
  }

  // ── Chart helpers ────────────────────────────────────────────────────────────
  private destroyAllCharts(): void {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
  }

  private mesLabel(anio: number, mes: number): string {
    return `${MES_LABELS[mes]} ${anio}`;
  }

  private renderChartActividad(): void {
    if (!this.chartActividadRef || !this.resumen) return;
    const data = this.resumen.actividadReciente;
    const chart = new Chart(this.chartActividadRef.nativeElement, {
      type: 'bar',
      data: {
        labels: data.map(r => this.mesLabel(r.anio, r.mes)),
        datasets: [
          {
            label: 'Kg cosechados',
            data: data.map(r => r.kgCosechado),
            backgroundColor: 'rgba(22, 130, 93, 0.7)',
            borderRadius: 6,
            yAxisID: 'y',
          },
          {
            label: 'Envíos',
            data: data.map(r => r.envios),
            type: 'line',
            borderColor: '#c98c14',
            backgroundColor: 'rgba(201, 140, 20, 0.12)',
            tension: 0.4,
            pointRadius: 4,
            fill: true,
            yAxisID: 'y1',
          },
        ],
      },
      options: this.defaultOptions('Actividad reciente (últimos 6 meses)', true),
    });
    this.charts.push(chart);
  }

  private renderChartTendenciaKg(): void {
    if (!this.chartTendenciaKgRef || !this.produccion) return;
    const data = this.produccion.tendencia;
    const chart = new Chart(this.chartTendenciaKgRef.nativeElement, {
      type: 'line',
      data: {
        labels: data.map(r => this.mesLabel(r.anio, r.mes)),
        datasets: [{
          label: 'Kg cosechados',
          data: data.map(r => r.kg),
          borderColor: '#16825d',
          backgroundColor: 'rgba(22, 130, 93, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
        }],
      },
      options: this.defaultOptions('Tendencia de cosecha (kg)'),
    });
    this.charts.push(chart);
  }

  private renderChartEstados(): void {
    if (!this.chartEstadosRef || !this.produccion) return;
    const data = this.produccion.porEstado;
    const chart = new Chart(this.chartEstadosRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: data.map(r => r.estado),
        datasets: [{
          data: data.map(r => r.cantidad),
          backgroundColor: ['#16825d','#1ba875','#c98c14','#167b83','#7c5ab8','#9f2d2d'],
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
        },
      },
    });
    this.charts.push(chart);
  }

  private renderChartRechazo(): void {
    if (!this.chartRechazoRef || !this.calidad) return;
    const data = this.calidad.tendenciaRechazo;
    const chart = new Chart(this.chartRechazoRef.nativeElement, {
      type: 'line',
      data: {
        labels: data.map(r => this.mesLabel(r.anio, r.mes)),
        datasets: [{
          label: '% Rechazo promedio',
          data: data.map(r => Number(r.pctRechazo)),
          borderColor: '#9f2d2d',
          backgroundColor: 'rgba(159, 45, 45, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
        }],
      },
      options: this.defaultOptions('Evolución del % de rechazo'),
    });
    this.charts.push(chart);
  }

  private renderChartNavieras(): void {
    if (!this.chartNavierasRef || !this.logistica) return;
    const data = this.logistica.porNaviera.slice(0, 6);
    const chart = new Chart(this.chartNavierasRef.nativeElement, {
      type: 'bar',
      data: {
        labels: data.map(r => r.naviera),
        datasets: [{
          label: 'Kg enviados',
          data: data.map(r => r.kg),
          backgroundColor: 'rgba(22, 123, 131, 0.75)',
          borderRadius: 6,
        }],
      },
      options: { ...this.defaultOptions('Navieras por volumen'), indexAxis: 'y' as const },
    });
    this.charts.push(chart);
  }

  private renderChartEnviosTendencia(): void {
    if (!this.chartEnviosTendenciaRef || !this.logistica) return;
    const data = this.logistica.tendencia;
    const chart = new Chart(this.chartEnviosTendenciaRef.nativeElement, {
      type: 'bar',
      data: {
        labels: data.map(r => this.mesLabel(r.anio, r.mes)),
        datasets: [
          {
            label: 'Envíos',
            data: data.map(r => r.envios),
            backgroundColor: 'rgba(22, 123, 131, 0.7)',
            borderRadius: 6,
            yAxisID: 'y',
          },
          {
            label: 'Kg',
            data: data.map(r => r.kg),
            type: 'line',
            borderColor: '#16825d',
            backgroundColor: 'rgba(22, 130, 93, 0.08)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y1',
          },
        ],
      },
      options: this.defaultOptions('Tendencia de envíos', true),
    });
    this.charts.push(chart);
  }

  private defaultOptions(title: string, dualAxis = false): object {
    const base: object = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: dualAxis },
        title: { display: false },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      },
    };
    if (dualAxis) {
      (base as Record<string, unknown>)['scales'] = {
        x: { grid: { display: false } },
        y:  { beginAtZero: true, position: 'left',  grid: { color: 'rgba(0,0,0,0.05)' } },
        y1: { beginAtZero: true, position: 'right', grid: { display: false } },
      };
    }
    return base;
  }

  // ── Utilities ────────────────────────────────────────────────────────────────
  formatKg(kg: number): string {
    if (kg >= 1_000_000) return `${(kg / 1_000_000).toFixed(1)}M kg`;
    if (kg >= 1_000)     return `${(kg / 1_000).toFixed(1)}K kg`;
    return `${kg.toFixed(0)} kg`;
  }
}
