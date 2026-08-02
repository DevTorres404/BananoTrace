import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { Envio, EnvioFilters, EstadoEnvio, LogisticsService } from '../logistics.service';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-envios-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './envios-page.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './envios-page.css'],
})
export class EnviosPage implements OnInit {
  private readonly logisticsService = inject(LogisticsService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  envios: Envio[] = [];
  isLoading = false;
  errorMessage = '';
  filters: EnvioFilters = { search: '', estado: '', page: 1, pageSize: 15 };
  pagination = { page: 1, pageSize: 15, total: 0, totalPages: 1 };
  summary = { total: 0, planned: 0, loaded: 0, inTransit: 0, delivered: 0 };

  get canCreate(): boolean {
    const role = this.authService.currentUser()?.idRol;
    return role === ROLE_IDS.ADMINISTRADOR || role === ROLE_IDS.LOGISTICA;
  }

  ngOnInit() {
    this.load();
  }

  load(resetPage = false) {
    if (resetPage) this.filters.page = 1;
    this.isLoading = true;
    this.errorMessage = '';
    this.logisticsService
      .getEnvios(this.filters)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.envios = res.data;
          this.summary = res.summary;
          this.pagination = res.pagination;
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudieron cargar los envíos.';
        },
      });
  }

  clearFilters() {
    this.filters = { search: '', estado: '', page: 1, pageSize: 15 };
    this.load();
  }

  changePage(page: number) {
    if (page < 1 || page > this.pagination.totalPages) return;
    this.filters.page = page;
    this.load();
  }

  onCreateEnvio() {
    this.router.navigate(['/envios/nuevo']);
  }

  onViewDetail(id: string) {
    this.router.navigate(['/envios', id]);
  }

  getBadgeClass(estado: EstadoEnvio): string {
    switch (estado) {
      case 'PLANIFICADO':
        return 'badge badge-gray';
      case 'CARGADO':
        return 'badge badge-yellow';
      case 'EN_TRANSITO':
        return 'badge badge-blue';
      case 'ENTREGADO':
        return 'badge badge-green';
      case 'CANCELADO':
        return 'badge badge-red';
      default:
        return 'badge badge-gray';
    }
  }

  getStateLabel(estado: EstadoEnvio): string {
    return estado === 'EN_TRANSITO' ? 'EN TRÁNSITO' : estado;
  }
}
