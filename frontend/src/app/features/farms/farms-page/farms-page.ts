import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import { Producer, ProducersService } from '../../producers/producers.service';
import { FarmForm } from '../farm-form/farm-form';
import { Farm, FarmDashboard, FarmFilters, FarmsService } from '../farms.service';

@Component({
  selector: 'app-farms-page',
  standalone: true,
  imports: [CommonModule, FormsModule, FarmForm],
  templateUrl: './farms-page.html',
  styleUrls: ['./farms-page.css'],
})
export class FarmsPage implements OnInit {
  private readonly farmsService = inject(FarmsService);
  private readonly producersService = inject(ProducersService);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  farms: Farm[] = [];
  producers: Producer[] = [];
  dashboard: FarmDashboard = {
    totalFincasActivas: 0,
    totalLotesActivos: 0,
    totalCertificaciones: 0,
    fincas: [],
  };
  filters: FarmFilters = { search: '', provincia: '', canton: '', idProductor: '', estado: '' };
  isLoading = true;
  busyId: string | null = null;
  errorMessage = '';
  selectedFarm: Farm | null = null;
  isFarmModalOpen = false;

  get isAdmin(): boolean {
    return this.authService.currentUser()?.idRol === ROLE_IDS.ADMINISTRADOR;
  }

  get farmsWithCoordinates(): number {
    return this.farms.filter((farm) => farm.latitud && farm.longitud).length;
  }

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.isLoading = true;
    this.errorMessage = '';
    forkJoin({
      farms: this.farmsService.getFarms(this.filters),
      dashboard: this.farmsService.getDashboard(),
      producers: this.isAdmin ? this.producersService.getProducers() : of([] as Producer[]),
    })
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ farms, dashboard, producers }) => {
          this.farms = farms;
          this.dashboard = dashboard;
          this.producers = producers;
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo cargar la gestión de fincas.';
        },
      });
  }

  applyFilters(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.farmsService
      .getFarms(this.filters)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (farms) => (this.farms = farms),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudieron aplicar los filtros.';
        },
      });
  }

  clearFilters(): void {
    this.filters = { search: '', provincia: '', canton: '', idProductor: '', estado: '' };
    this.applyFilters();
  }

  openFarmModal(farm: Farm | null = null): void {
    this.selectedFarm = farm;
    this.isFarmModalOpen = true;
  }

  closeFarmModal(): void {
    this.isFarmModalOpen = false;
    this.selectedFarm = null;
  }

  onFarmSaved(): void {
    this.closeFarmModal();
    this.loadAll();
  }

  toggleFarm(farm: Farm): void {
    this.busyId = farm.idFinca;
    this.errorMessage = '';
    const request = farm.estado
      ? this.farmsService.deactivateFarm(farm.idFinca)
      : this.farmsService.updateFarm(farm.idFinca, { estado: true });
    request
      .pipe(
        finalize(() => {
          this.busyId = null;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => this.loadAll(),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo cambiar el estado de la finca.';
        },
      });
  }

  formatCoordinates(farm: Farm): string {
    return farm.latitud && farm.longitud ? `${farm.latitud}, ${farm.longitud}` : 'Sin registrar';
  }
}
