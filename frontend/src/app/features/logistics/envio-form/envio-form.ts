import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, inject, OnInit, Output } from '@angular/core';
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
    <div class="modal-overlay" (click)="onCancel()">
      <div class="modal-container" (click)="$event.stopPropagation()">
        <header class="modal-header">
          <h2 class="modal-title">Planificar Nuevo Envío</h2>
          <button class="btn-close" (click)="onCancel()" aria-label="Cerrar">×</button>
        </header>

        <div class="modal-body">
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
            <button type="button" class="btn btn-secondary" (click)="onCancel()">Cancelar</button>
            <button type="submit" class="btn btn-primary" [disabled]="form.invalid || saving">
              {{ saving ? 'Guardando...' : 'Crear Envío' }}
            </button>
          </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        padding: 20px;
      }
      .modal-container {
        background: var(--color-surface);
        border-radius: 12px;
        width: 100%;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        border-bottom: 1px solid var(--color-border);
      }
      .modal-title {
        margin: 0;
        font-size: 1.25rem;
        color: var(--color-text-primary);
      }
      .btn-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: var(--color-text-secondary);
      }
      .modal-body {
        padding: 24px;
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

  @Output() cancel = new EventEmitter<void>();

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

  onCancel() {
    this.cancel.emit();
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
