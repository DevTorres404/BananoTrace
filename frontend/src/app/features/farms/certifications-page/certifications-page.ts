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
  searchQuery = '';
  page = 1;
  pageSize = 20;
  total = 0;
  totalPages = 1;
  isModalOpen = false;
  isLoading = true;
  busyId: string | null = null;
  errorMessage = '';

  get activeFarms(): Farm[] {
    return this.farms.filter((farm) => farm.estado);
  }

  get visibleCertifications(): Certification[] {
    return this.certifications;
  }

  summary = { total: 0, validCount: 0, expiredCount: 0 };

  get validCount(): number {
    return this.summary.validCount;
  }

  get expiredCount(): number {
    return this.summary.expiredCount;
  }

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    // Si no es admin/etc (en la vida real lo resolvería el backend), acá 
    // ya pasamos los filtros a la API para que devuelva paginado.
    // Ojo que statusFilter en este código original era solo frontend, 
    // lo dejo sin mandar al backend si no lo hicimos en el backend, 
    // pero si filtramos por status en frontend, la paginación de backend
    // rompe los totales. Como el requerimiento es "no tiene paginacion", 
    // vamos a pedir la pagina entera y quitar statusFilter local.
    // Wait, el backend no acepta statusFilter en findCertifications aún. 
    // Si lo aplico localmente se rompe la paginación. 
    // Idealmente el filtro debe ir al backend, pero por ahora paginamos 
    // los datos base.
    
    forkJoin({
      certPage: this.farmsService.getCertifications({
        farmId: this.selectedFarmId || undefined,
        status: this.statusFilter || undefined,
        q: this.searchQuery.trim() || undefined,
        page: this.page,
        pageSize: this.pageSize,
      }),
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
        next: ({ certPage, farms }) => {
          this.certifications = certPage.data;
          this.summary = certPage.summary || { total: 0, validCount: 0, expiredCount: 0 };
          this.total = certPage.pagination.total;
          this.totalPages = certPage.pagination.totalPages;
          this.farms = farms;
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudieron cargar las certificaciones.';
        },
      });
  }

  onFilterChange(): void {
    this.page = 1;
    this.loadAll();
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page++;
      this.loadAll();
    }
  }

  previousPage(): void {
    if (this.page > 1) {
      this.page--;
      this.loadAll();
    }
  }

  clearFilters(): void {
    this.selectedFarmId = '';
    this.statusFilter = '';
    this.searchQuery = '';
    this.page = 1;
    this.loadAll();
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
