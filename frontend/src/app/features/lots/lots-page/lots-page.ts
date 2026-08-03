import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, finalize } from 'rxjs';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import { LotForm } from '../lot-form/lot-form';
import {
  LOT_STATE_LABELS,
  Lot,
  LotFarmOption,
  LotFilters,
  LotState,
  LotVarietyOption,
  LotsService,
} from '../lots.service';

@Component({
  selector: 'app-lots-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LotForm],
  templateUrl: './lots-page.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './lots-page.css'],
})
export class LotsPage implements OnInit {
  private readonly lotsService = inject(LotsService);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  lots: Lot[] = [];
  farms: LotFarmOption[] = [];
  states: LotState[] = [];
  varieties: LotVarietyOption[] = [];
  filters: LotFilters = { q: '', idFinca: '', estado: '', desde: '', hasta: '', page: 1, pageSize: 10 };
  pagination = { page: 1, pageSize: 10, total: 0, totalPages: 1 };
  summary = { totalLots: 0, activeLots: 0, totalPlants: 0 };
  selectedLot: Lot | null = null;
  isModalOpen = false;
  isLoading = true;
  errorMessage = '';
  readonly stateLabels = LOT_STATE_LABELS;

  get canManage(): boolean {
    const role = this.authService.currentUser()?.idRol;
    return role === ROLE_IDS.ADMINISTRADOR || role === ROLE_IDS.SUPERVISOR_AGRICOLA;
  }

  ngOnInit(): void {
    this.loadInitial();
  }

  loadInitial(): void {
    this.isLoading = true;
    forkJoin({
      page: this.lotsService.getLots(this.filters),
      options: this.lotsService.getOptions(),
    })
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ page, options }) => {
          this.lots = page.data;
          this.pagination = page.pagination;
          this.summary = page.summary;
          this.farms = options.farms;
          this.states = options.states;
          this.varieties = options.varieties;
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudieron cargar los lotes.';
        },
      });
  }

  applyFilters(resetPage = true): void {
    if (resetPage) this.filters.page = 1;
    this.isLoading = true;
    this.errorMessage = '';
    this.lotsService
      .getLots(this.filters)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (page) => {
          this.lots = page.data;
          this.pagination = page.pagination;
          this.summary = page.summary;
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudieron aplicar los filtros.';
        },
      });
  }

  clearFilters(): void {
    this.filters = { q: '', idFinca: '', estado: '', desde: '', hasta: '', page: 1, pageSize: 10 };
    this.applyFilters(false);
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pagination.totalPages) return;
    this.filters.page = page;
    this.applyFilters(false);
  }

  openModal(lot: Lot | null = null): void {
    this.selectedLot = lot;
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.selectedLot = null;
  }

  onSaved(): void {
    this.closeModal();
    this.loadInitial();
  }
}
