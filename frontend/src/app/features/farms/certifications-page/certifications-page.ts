import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { CertificationForm } from '../certification-form/certification-form';
import { Certification, Farm, FarmsService } from '../farms.service';

const FARM_PICKER_PAGE_SIZE = 100;

@Component({
  selector: 'app-certifications-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CertificationForm],
  templateUrl: './certifications-page.html',
  styleUrls: ['../farms-page/farms-page.css', './certifications-page.css'],
})
export class CertificationsPage implements OnInit {
  private readonly farmsService = inject(FarmsService);
  private readonly cdr = inject(ChangeDetectorRef);

  farms: Farm[] = [];
  certifications: Certification[] = [];
  selectedCertification: Certification | null = null;
  selectedFarmId = '';
  statusFilter = '';
  isModalOpen = false;
  isLoading = true;
  busyId: string | null = null;
  errorMessage = '';

  get activeFarms(): Farm[] {
    return this.farms.filter((farm) => farm.estado);
  }

  get visibleCertifications(): Certification[] {
    return this.certifications.filter(
      (certification) =>
        (!this.selectedFarmId || certification.idFinca === this.selectedFarmId) &&
        (!this.statusFilter || certification.estado === this.statusFilter),
    );
  }

  get validCount(): number {
    return this.certifications.filter((item) => item.estado === 'VIGENTE').length;
  }

  get expiredCount(): number {
    return this.certifications.filter((item) => item.estado === 'VENCIDA').length;
  }

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.isLoading = true;
    this.errorMessage = '';
    forkJoin({
      certifications: this.farmsService.getCertifications(),
      farms: this.farmsService
        .getFarms({ pageSize: FARM_PICKER_PAGE_SIZE })
        .pipe(map((page) => page.data)),
    })
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ certifications, farms }) => {
          this.certifications = certifications;
          this.farms = farms;
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudieron cargar las certificaciones.';
        },
      });
  }

  clearFilters(): void {
    this.selectedFarmId = '';
    this.statusFilter = '';
  }

  openModal(certification: Certification | null = null): void {
    this.selectedCertification = certification;
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.selectedCertification = null;
  }

  onSaved(): void {
    this.closeModal();
    this.loadAll();
  }

  deleteCertification(certification: Certification): void {
    if (!window.confirm(`¿Eliminar el certificado ${certification.numeroCertificado}?`)) return;
    this.busyId = certification.idCertificacion;
    this.farmsService
      .deleteCertification(certification.idFinca, certification.idCertificacion)
      .pipe(
        finalize(() => {
          this.busyId = null;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => this.loadAll(),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo eliminar la certificación.';
        },
      });
  }
}
