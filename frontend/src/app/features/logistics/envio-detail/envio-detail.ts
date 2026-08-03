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
    <main class="farms-page shipment-detail-page" *ngIf="envio">
      <a (click)="goBack()" class="back-link" style="cursor: pointer;">← Volver a Envíos</a>
      
      <header class="page-header detail-header">
        <div>
          <p class="eyebrow">Envío Logístico</p>
          <h1 class="page-title">{{ envio.codigoEnvio }}</h1>
          <p>Destino: {{ envio.puertoDestino }}, {{ envio.paisDestino }}</p>
        </div>
        <div class="header-actions">
          <span class="status lot-status" [class]="getBadgeClass(envio.estado)">{{ envio.estado }}</span>
          <button class="btn-primary" 
            *ngIf="canManage && envio.estado !== 'ENTREGADO' && envio.estado !== 'CANCELADO'"
            [disabled]="isAdvancing" (click)="advanceEnvio()">
            {{ isAdvancing ? 'Actualizando...' : advanceLabel }}
          </button>
        </div>
        <p class="error-msg" *ngIf="actionError">{{ actionError }}</p>
      </header>

      <div class="detail-grid">
        <section class="panel">
          <h2>Información del Envío</h2>
          <dl class="data-grid">
            <div>
              <dt>Origen</dt>
              <dd>{{ envio.puertoOrigen }}</dd>
            </div>
            <div>
              <dt>Destino</dt>
              <dd>{{ envio.puertoDestino }}, {{ envio.paisDestino }}</dd>
            </div>
            <div>
              <dt>Naviera</dt>
              <dd>{{ envio.naviera || 'No asignada' }}</dd>
            </div>
            <div>
              <dt>Contenedor</dt>
              <dd class="font-mono">{{ envio.numeroContenedor || 'Pendiente' }}</dd>
            </div>
            <div>
              <dt>Temp. Salida</dt>
              <dd>{{ envio.temperaturaSalida ? envio.temperaturaSalida + ' °C' : 'N/D' }}</dd>
            </div>
            <div>
              <dt>Llegada (Est.)</dt>
              <dd>{{ (envio.fechaEstimadaLlegada | date: 'shortDate') || 'N/D' }}</dd>
            </div>
            <div>
              <dt>Salida</dt>
              <dd>{{ (envio.fechaSalida | date: 'shortDate') || 'Pendiente' }}</dd>
            </div>
          </dl>
        </section>

        <section class="panel">
          <div class="section-heading">
            <div>
              <h2>Cajas Asignadas</h2>
              <p>{{ envio.empaques?.length || 0 }} registradas en este envío</p>
            </div>
            <button
              class="btn-outline"
              (click)="openAssignModal()"
              *ngIf="canAssignPackages"
            >
              + Asignar Cajas
            </button>
          </div>

          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Peso</th>
                  <th>Categoría</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngIf="!envio.empaques || envio.empaques.length === 0">
                  <td colspan="3" class="text-center" style="padding: 2rem;">No hay cajas asignadas a este envío.</td>
                </tr>
                <tr *ngFor="let emp of envio.empaques">
                  <td class="font-mono">{{ emp.codigoCaja }}</td>
                  <td>{{ emp.pesoNetoKg }} kg</td>
                  <td>{{ emp.categoria || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>

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
  styleUrls: ['../../farms/farms-page/farms-page.css', './envio-detail.css'],
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
