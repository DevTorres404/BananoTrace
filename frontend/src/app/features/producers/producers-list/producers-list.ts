import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import { ProducerForm } from '../producer-form/producer-form';
import { Producer, ProducerFilters, ProducersService } from '../producers.service';

@Component({
  selector: 'app-producers-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ProducerForm],
  templateUrl: './producers-list.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './producers-list.css'],
})
export class ProducersList implements OnInit {
  private readonly producersService = inject(ProducersService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly authService = inject(AuthService);

  producers: Producer[] = [];
  pagination = { page: 1, pageSize: 10, total: 0, totalPages: 1 };
  filters: ProducerFilters = { q: '', vinculado: '', page: 1, pageSize: 10 };
  isLoading = true;
  deletingId: string | null = null;
  modalProducerId: string | null = null;
  isFormModalOpen = false;
  errorMessage = '';

  get isAdmin(): boolean {
    return this.authService.currentUser()?.idRol === ROLE_IDS.ADMINISTRADOR;
  }

  get linkedProducers(): number {
    return this.producers.filter((producer) => producer.usuarios.length > 0).length;
  }

  get totalFarms(): number {
    return this.producers.reduce((total, producer) => total + producer.totalFincas, 0);
  }

  ngOnInit(): void {
    this.loadProducers();
  }

  loadProducers(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.producersService
      .getProducers(this.filters)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (page) => {
          this.producers = page.data;
          this.pagination = page.pagination;
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo cargar la lista de productores.';
        },
      });
  }

  applyFilters(resetPage = true): void {
    if (resetPage) this.filters.page = 1;
    this.loadProducers();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pagination.totalPages) return;
    this.filters.page = page;
    this.applyFilters(false);
  }

  openCreateModal(): void {
    this.modalProducerId = null;
    this.isFormModalOpen = true;
  }

  openEditModal(id: string): void {
    this.modalProducerId = id;
    this.isFormModalOpen = true;
  }

  closeFormModal(): void {
    this.isFormModalOpen = false;
    this.modalProducerId = null;
  }

  onProducerSaved(): void {
    this.closeFormModal();
    this.loadProducers();
  }

  clearFilters(): void {
    this.filters = { q: '', vinculado: '', page: 1, pageSize: 10 };
    this.applyFilters(true);
  }

  deleteProducer(producer: Producer): void {
    this.errorMessage = '';
    this.deletingId = producer.idProductor;

    this.producersService
      .deleteProducer(producer.idProductor)
      .pipe(
        finalize(() => {
          this.deletingId = null;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => this.loadProducers(),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo eliminar el productor.';
        },
      });
  }

  getInitials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('');
  }
}
