import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import { ProducerForm } from '../producer-form/producer-form';
import { Producer, ProducersService } from '../producers.service';

@Component({
  selector: 'app-producers-list',
  standalone: true,
  imports: [CommonModule, ProducerForm],
  templateUrl: './producers-list.html',
  styleUrls: ['./producers-list.css'],
})
export class ProducersList implements OnInit {
  private readonly producersService = inject(ProducersService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly authService = inject(AuthService);

  producers: Producer[] = [];
  isLoading = true;
  deletingId: string | null = null;
  modalProducerId: string | null = null;
  isFormModalOpen = false;
  errorMessage = '';

  get isAdmin(): boolean {
    return this.authService.currentUser()?.idRol === ROLE_IDS.ADMINISTRADOR;
  }

  ngOnInit(): void {
    this.loadProducers();
  }

  loadProducers(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.producersService
      .getProducers()
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (producers) => (this.producers = producers),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo cargar la lista de productores.';
        },
      });
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
        next: () => {
          this.producers = this.producers.filter((p) => p.idProductor !== producer.idProductor);
        },
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
