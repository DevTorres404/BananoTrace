import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  CreateEnvioPayload,
  LogisticsCatalogOption,
  LogisticsService,
  PortOption,
} from '../logistics.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-envio-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <header class="page-header">
        <button class="btn-back" (click)="goBack()">Volver</button>
        <h1 class="page-title">Planificar Nuevo Envío</h1>
      </header>

      <div class="form-card">
        <form (ngSubmit)="onSubmit()" #form="ngForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Puerto Origen *</label>
              <select
                name="puertoOrigen"
                [(ngModel)]="model.puertoOrigen"
                required
                [disabled]="optionsLoading"
              >
                <option value="" disabled>Seleccione un puerto</option>
                <option *ngFor="let port of ports" [value]="port.codigo">
                  {{ port.nombre }} · {{ port.paisNombre || 'País no especificado' }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>Puerto Destino *</label>
              <select
                name="puertoDestino"
                [(ngModel)]="model.puertoDestino"
                required
                [disabled]="optionsLoading"
              >
                <option value="" disabled>Seleccione un puerto</option>
                <option
                  *ngFor="let port of ports"
                  [value]="port.codigo"
                  [disabled]="port.codigo === model.puertoOrigen"
                >
                  {{ port.nombre }} · {{ port.paisNombre || 'País no especificado' }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>País de destino</label>
              <input
                type="text"
                [value]="destinationCountry"
                readonly
                placeholder="Se obtiene del puerto seleccionado"
              />
            </div>
            <div class="form-group">
              <label>Naviera</label>
              <select name="naviera" [(ngModel)]="model.naviera" [disabled]="optionsLoading">
                <option [ngValue]="undefined">Sin naviera asignada</option>
                <option *ngFor="let shippingLine of shippingLines" [value]="shippingLine.codigo">
                  {{ shippingLine.nombre }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>Número Contenedor</label>
              <input type="text" name="numeroContenedor" [(ngModel)]="model.numeroContenedor" />
            </div>
            <div class="form-group">
              <label>Temp. Salida (°C)</label>
              <input
                type="number"
                name="temperaturaSalida"
                [(ngModel)]="model.temperaturaSalida"
                step="0.1"
              />
            </div>
            <div class="form-group">
              <label>Fecha Estimada Llegada</label>
              <input
                type="date"
                name="fechaEstimadaLlegada"
                [(ngModel)]="model.fechaEstimadaLlegada"
              />
            </div>
          </div>

          <div class="error-msg" *ngIf="errorMessage">{{ errorMessage }}</div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" (click)="goBack()">Cancelar</button>
            <button type="submit" class="btn btn-primary" [disabled]="form.invalid || saving">
              {{ saving ? 'Guardando...' : 'Crear Envío' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [
    `
      .page-container {
        padding: 24px;
        max-width: 800px;
        margin: 0 auto;
      }
      .page-header {
        margin-bottom: 24px;
      }
      .btn-back {
        background: none;
        border: none;
        color: var(--color-primary);
        cursor: pointer;
        padding: 0;
        font-size: 0.9rem;
        margin-bottom: 8px;
      }
      .page-title {
        margin: 0;
        font-size: 1.8rem;
        color: var(--color-text-primary);
        font-weight: 700;
      }

      .form-card {
        background: var(--color-surface);
        color: var(--color-text-primary);
        border: 1px solid var(--color-border);
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 1px 3px var(--color-shadow);
      }
      .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 24px;
      }
      .form-group {
        display: flex;
        flex-direction: column;
      }
      .form-group label {
        margin-bottom: 6px;
        font-weight: 500;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
      }
      .form-group input,
      .form-group select {
        padding: 10px;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        font-size: 1rem;
        background: var(--color-input);
        color: var(--color-text-primary);
      }

      .error-msg {
        color: #dc3545;
        margin-bottom: 16px;
        font-size: 0.9rem;
      }
      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }

      .btn {
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        border: none;
        font-weight: 500;
        font-size: 1rem;
      }
      .btn-secondary {
        background: var(--color-surface-strong);
        color: var(--color-text-primary);
      }
      .btn-primary {
        background: var(--color-primary);
        color: white;
      }
      .btn-primary:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
    `,
  ],
})
export class EnvioForm implements OnInit {
  private logisticsService = inject(LogisticsService);
  private router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  model: Partial<CreateEnvioPayload> = { puertoOrigen: '', puertoDestino: '' };
  saving = false;
  errorMessage = '';
  ports: PortOption[] = [];
  shippingLines: LogisticsCatalogOption[] = [];
  optionsLoading = true;

  get destinationCountry(): string {
    return this.ports.find(({ codigo }) => codigo === this.model.puertoDestino)?.paisNombre ?? '';
  }

  ngOnInit(): void {
    this.logisticsService
      .getOptions()
      .pipe(
        finalize(() => {
          this.optionsLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ puertos, navieras }) => {
          this.ports = puertos;
          this.shippingLines = navieras;
        },
        error: () => (this.errorMessage = 'No se pudieron cargar los catálogos de logística'),
      });
  }

  goBack() {
    this.router.navigate(['/envios']);
  }

  onSubmit() {
    if (!this.model.puertoOrigen || !this.model.puertoDestino) return;

    this.saving = true;
    this.errorMessage = '';

    const payload: CreateEnvioPayload = {
      puertoOrigen: this.model.puertoOrigen,
      puertoDestino: this.model.puertoDestino,
      naviera: this.model.naviera || undefined,
      numeroContenedor: this.model.numeroContenedor || undefined,
      temperaturaSalida: this.model.temperaturaSalida ?? undefined,
      // The API expects ISO string or similar, but the input date gives YYYY-MM-DD
      fechaEstimadaLlegada: this.model.fechaEstimadaLlegada
        ? new Date(this.model.fechaEstimadaLlegada).toISOString()
        : undefined,
    };

    this.logisticsService
      .createEnvio(payload)
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (envio) => {
          this.router.navigate(['/envios', envio.idEnvio]);
        },
        error: (err) => (this.errorMessage = err?.error?.message || 'Error al crear el envío'),
      });
  }
}
