import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Envio, Empaque, LogisticsService } from '../logistics.service';
import { FormsModule } from '@angular/forms';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-envio-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container" *ngIf="envio">
      <header class="page-header">
        <button class="btn-back" (click)="goBack()">← Volver a Envíos</button>
        <div class="title-row">
          <h1 class="page-title">Envío {{ envio.codigoEnvio }}</h1>
          <span [class]="getBadgeClass(envio.estado)">{{ envio.estado }}</span>
        </div>
        <div
          class="flow-actions"
          *ngIf="canManage && envio.estado !== 'ENTREGADO' && envio.estado !== 'CANCELADO'"
        >
          <button class="btn btn-primary" [disabled]="isAdvancing" (click)="advanceEnvio()">
            {{ isAdvancing ? 'Actualizando...' : advanceLabel }}
          </button>
        </div>
        <p class="error-msg" *ngIf="actionError">{{ actionError }}</p>
      </header>

      <div class="layout-grid">
        <div class="left-col">
          <div class="detail-card mb-4">
            <h3>Información del Envío</h3>
            <div class="info-grid">
              <div class="info-item">
                <span class="label">Destino</span>
                <span class="value">{{ envio.puertoDestino }}, {{ envio.paisDestino }}</span>
              </div>
              <div class="info-item">
                <span class="label">Origen</span>
                <span class="value">{{ envio.puertoOrigen }}</span>
              </div>
              <div class="info-item">
                <span class="label">Naviera</span>
                <span class="value">{{ envio.naviera || 'No asignada' }}</span>
              </div>
              <div class="info-item">
                <span class="label">Contenedor</span>
                <span class="value font-mono">{{ envio.numeroContenedor || 'Pendiente' }}</span>
              </div>
              <div class="info-item">
                <span class="label">Temp. Salida</span>
                <span class="value">{{
                  envio.temperaturaSalida ? envio.temperaturaSalida + ' °C' : 'N/D'
                }}</span>
              </div>
              <div class="info-item">
                <span class="label">Salida</span>
                <span class="value">{{
                  (envio.fechaSalida | date: 'shortDate') || 'Pendiente'
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="right-col">
          <div class="detail-card">
            <div class="card-header">
              <h3>Cajas Asignadas ({{ envio.empaques?.length || 0 }})</h3>
              <button
                class="btn btn-outline btn-sm"
                (click)="openAssignModal()"
                *ngIf="canAssignPackages"
              >
                + Asignar Cajas
              </button>
            </div>

            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Peso</th>
                    <th>Categoría</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngIf="!envio.empaques || envio.empaques.length === 0">
                    <td colspan="3" class="text-center">No hay cajas asignadas a este envío.</td>
                  </tr>
                  <tr *ngFor="let emp of envio.empaques">
                    <td class="font-mono">{{ emp.codigoCaja }}</td>
                    <td>{{ emp.pesoNetoKg }} kg</td>
                    <td>{{ emp.categoria || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal para asignar cajas -->
    <div class="modal-backdrop" *ngIf="showAssignModal" (click)="showAssignModal = false">
      <div class="modal-panel" (click)="$event.stopPropagation()">
        <header class="modal-header">
          <h2>Asignar Cajas</h2>
          <button class="btn-close" (click)="showAssignModal = false">×</button>
        </header>
        <div class="modal-body">
          <p class="text-sm mb-4">
            Selecciona las cajas disponibles que deseas asignar a este envío.
          </p>

          <div *ngIf="loadingDisponibles" class="text-center">Cargando cajas disponibles...</div>
          <div *ngIf="!loadingDisponibles && disponibles.length === 0" class="alert alert-info">
            No hay cajas disponibles en este momento.
          </div>

          <div class="cajas-list" *ngIf="disponibles.length > 0">
            <label class="caja-item" *ngFor="let emp of disponibles">
              <input
                type="checkbox"
                [value]="emp.idEmpaque"
                (change)="toggleSelection(emp.idEmpaque, $event)"
              />
              <div class="caja-info">
                <span class="caja-code font-mono">{{ emp.codigoCaja }}</span>
                <span class="caja-details"
                  >{{ emp.pesoNetoKg }} kg - {{ emp.categoria || 'Sin cat' }}</span
                >
              </div>
            </label>
          </div>

          <div class="error-msg mt-3" *ngIf="assignError">{{ assignError }}</div>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-secondary" (click)="showAssignModal = false">Cancelar</button>
          <button
            class="btn btn-primary"
            [disabled]="selectedEmpaques.length === 0 || savingAssign"
            (click)="assignSelected()"
          >
            {{ savingAssign ? 'Asignando...' : 'Asignar (' + selectedEmpaques.length + ')' }}
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [
    `
      .page-container {
        padding: 24px;
        max-width: 1200px;
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
      .title-row {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .page-title {
        margin: 0;
        font-size: 2rem;
        color: var(--color-text-primary);
        font-weight: 700;
      }

      .layout-grid {
        display: grid;
        grid-template-columns: 1fr 2fr;
        gap: 24px;
      }
      @media (max-width: 768px) {
        .layout-grid {
          grid-template-columns: 1fr;
        }
      }

      .detail-card {
        background: var(--color-surface);
        border-radius: 12px;
        box-shadow: 0 8px 24px var(--color-shadow);
        padding: 20px;
      }
      .detail-card h3 {
        margin-top: 0;
        margin-bottom: 16px;
        font-size: 1.1rem;
        color: var(--color-text-primary);
        border-bottom: 1px solid var(--color-border);
        padding-bottom: 8px;
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--color-border);
        margin-bottom: 16px;
        padding-bottom: 8px;
      }
      .card-header h3 {
        border: none;
        margin: 0;
        padding: 0;
      }

      .info-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
      }
      .info-item {
        display: flex;
        flex-direction: column;
      }
      .info-item .label {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .info-item .value {
        font-size: 1rem;
        color: var(--color-text-primary);
      }

      .table-responsive {
        overflow-x: auto;
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      .data-table th {
        background: var(--color-surface-strong);
        padding: 8px 12px;
        font-weight: 600;
        color: var(--color-text-secondary);
        font-size: 0.875rem;
        border-bottom: 1px solid var(--color-border);
      }
      .data-table td {
        padding: 12px;
        border-bottom: 1px solid var(--color-border);
        color: var(--color-text-primary);
        font-size: 0.95rem;
      }

      .font-mono {
        font-family: monospace;
      }
      .font-medium {
        font-weight: 500;
      }
      .text-center {
        text-align: center;
        color: var(--color-text-secondary);
        padding: 24px !important;
      }
      .mb-4 {
        margin-bottom: 16px;
      }
      .mt-3 {
        margin-top: 12px;
      }

      .badge {
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
      }
      .badge-gray {
        background: var(--color-surface-strong);
        color: var(--color-text-secondary);
      }
      .badge-yellow {
        background: #fef08a;
        color: #854d0e;
      }
      .badge-blue {
        background: #dbeafe;
        color: #1e40af;
      }
      .badge-green {
        background: #dcfce7;
        color: #166534;
      }

      .btn {
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        border: none;
        font-weight: 500;
      }
      .btn-sm {
        padding: 4px 10px;
        font-size: 0.875rem;
      }
      .btn-primary {
        background: var(--color-primary);
        color: white;
      }
      .btn-secondary {
        background: var(--color-border);
        color: var(--color-text-secondary);
      }
      .btn-outline {
        background: transparent;
        border: 1px solid var(--color-border);
        color: var(--color-text-secondary);
      }
      .btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }

      /* Modal Styles */
      .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .modal-panel {
        background: var(--color-surface);
        border-radius: 8px;
        width: 100%;
        max-width: 500px;
        padding: 20px;
        box-shadow: 0 18px 50px var(--color-shadow);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .modal-header h2 {
        margin: 0;
        font-size: 1.25rem;
      }
      .btn-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
      }
      .modal-body {
        overflow-y: auto;
        flex: 1;
      }
      .text-sm {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        margin-top: 0;
      }
      .alert-info {
        background: #e0f2fe;
        color: #0369a1;
        padding: 12px;
        border-radius: 6px;
      }
      .error-msg {
        color: #dc3545;
        font-size: 0.9rem;
      }

      .cajas-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .caja-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        cursor: pointer;
      }
      .caja-item:hover {
        background: var(--color-surface-strong);
      }
      .caja-info {
        display: flex;
        flex-direction: column;
      }
      .caja-code {
        font-weight: 600;
        color: var(--color-text-primary);
      }
      .caja-details {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--color-border);
      }
    `,
  ],
})
export class EnvioDetail implements OnInit {
  private readonly logisticsService = inject(LogisticsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  envio: Envio | null = null;
  idEnvio = '';

  showAssignModal = false;
  disponibles: Empaque[] = [];
  loadingDisponibles = false;
  selectedEmpaques: string[] = [];
  savingAssign = false;
  assignError = '';
  actionError = '';
  isAdvancing = false;

  get canManage(): boolean {
    const role = this.authService.currentUser()?.idRol;
    return role === ROLE_IDS.ADMINISTRADOR || role === ROLE_IDS.LOGISTICA;
  }

  get advanceLabel(): string {
    switch (this.envio?.estado) {
      case 'PLANIFICADO':
        return 'Marcar como cargado';
      case 'CARGADO':
        return 'Iniciar tránsito';
      case 'EN_TRANSITO':
        return 'Marcar como entregado';
      default:
        return 'Avanzar estado';
    }
  }

  ngOnInit() {
    this.idEnvio = this.route.snapshot.paramMap.get('id') || '';
    if (this.idEnvio) {
      this.load();
    }
  }

  load() {
    this.logisticsService
      .getEnvioById(this.idEnvio)
      .pipe(finalize(() => this.cdr.detectChanges()))
      .subscribe({
        next: (envio) => {
          this.envio = envio;
        },
      });
  }

  goBack() {
    this.router.navigate(['/envios']);
  }

  getBadgeClass(estado: string): string {
    switch (estado) {
      case 'PLANIFICADO':
        return 'badge badge-gray';
      case 'CARGADO':
        return 'badge badge-yellow';
      case 'EN_TRANSITO':
        return 'badge badge-blue';
      case 'ENTREGADO':
        return 'badge badge-green';
      default:
        return 'badge badge-gray';
    }
  }

  get canAssignPackages(): boolean {
    return (
      this.canManage && (this.envio?.estado === 'PLANIFICADO' || this.envio?.estado === 'CARGADO')
    );
  }

  openAssignModal() {
    if (!this.canAssignPackages) return;
    this.selectedEmpaques = [];
    this.assignError = '';
    this.showAssignModal = true;
    this.loadDisponibles();
  }

  loadDisponibles() {
    this.loadingDisponibles = true;
    this.logisticsService
      .getEmpaques({ estado: 'DISPONIBLE' })
      .pipe(
        finalize(() => {
          this.loadingDisponibles = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.disponibles = res.data;
        },
        error: () => undefined,
      });
  }

  toggleSelection(id: string, event: any) {
    if (event.target.checked) {
      this.selectedEmpaques.push(id);
    } else {
      this.selectedEmpaques = this.selectedEmpaques.filter((e) => e !== id);
    }
  }

  assignSelected() {
    if (this.selectedEmpaques.length === 0) return;
    this.savingAssign = true;
    this.assignError = '';

    this.logisticsService
      .assignEmpaques(this.idEnvio, { empaquesIds: this.selectedEmpaques })
      .pipe(
        finalize(() => {
          this.savingAssign = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.showAssignModal = false;
          this.selectedEmpaques = [];
          this.load(); // Reload envíos to show assigned boxes
        },
        error: (err) => {
          this.assignError = err?.error?.message || 'Error al asignar cajas';
        },
      });
  }

  advanceEnvio() {
    if (!this.envio || this.isAdvancing) return;
    this.isAdvancing = true;
    this.actionError = '';
    this.logisticsService
      .advanceEnvio(this.envio.idEnvio)
      .pipe(
        finalize(() => {
          this.isAdvancing = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (envio) => {
          this.envio = envio;
        },
        error: (error) => {
          this.actionError = error?.error?.message || 'No se pudo avanzar el envío';
        },
      });
  }
}
