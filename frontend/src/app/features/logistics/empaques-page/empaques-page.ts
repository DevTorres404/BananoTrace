import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { Empaque, EstadoEmpaque, LogisticsService } from '../logistics.service';
import { EmpaqueForm } from '../empaque-form/empaque-form';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-empaques-page',
  standalone: true,
  imports: [CommonModule, FormsModule, EmpaqueForm],
  templateUrl: './empaques-page.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './empaques-page.css'],
})
export class EmpaquesPage implements OnInit {
  private readonly logisticsService = inject(LogisticsService);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  empaques: Empaque[] = [];
  isLoading = false;
  statusFilter: EstadoEmpaque | '' = '';
  searchQuery = '';
  errorMessage = '';

  showCreateModal = false;
  summary = { total: 0, disponibles: 0, asignadas: 0, enTransito: 0, entregadas: 0 };
  pagination = { page: 1, pageSize: 10, total: 0, totalPages: 1 };

  get canCreate(): boolean {
    const role = this.authService.currentUser()?.idRol;
    return role === ROLE_IDS.ADMINISTRADOR || role === ROLE_IDS.CALIDAD;
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.isLoading = true;
    this.errorMessage = '';
    const filter: any = { page: this.pagination.page, pageSize: this.pagination.pageSize };
    if (this.statusFilter) filter.estado = this.statusFilter;
    if (this.searchQuery) filter.q = this.searchQuery.trim();

    this.logisticsService
      .getEmpaques(filter)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.empaques = res.data;
          this.pagination = res.pagination;
          this.summary = res.summary;
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudieron cargar los empaques.';
        },
      });
  }

  clearFilters() {
    this.statusFilter = '';
    this.searchQuery = '';
    this.load();
  }

  onEmpaqueSaved() {
    this.showCreateModal = false;
    this.load();
  }

  getBadgeClass(estado: EstadoEmpaque): string {
    switch (estado) {
      case 'DISPONIBLE':
        return 'badge badge-green';
      case 'ASIGNADO':
        return 'badge badge-blue';
      case 'EN_TRANSITO':
        return 'badge badge-teal';
      case 'ENTREGADO':
        return 'badge badge-green';
      case 'RECHAZADO':
        return 'badge badge-red';
      default:
        return 'badge badge-gray';
    }
  }

  getStateLabel(estado: EstadoEmpaque): string {
    return estado === 'EN_TRANSITO' ? 'EN TRÁNSITO' : estado;
  }

  changePage(page: number) {
    if (page < 1 || page > this.pagination.totalPages) return;
    this.pagination.page = page;
    this.load();
  }
}
