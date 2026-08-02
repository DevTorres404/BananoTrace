import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Output,
  Input,
  inject,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CreateEmpaquePayload,
  Empaque,
  LogisticsCatalogOption,
  LogisticsService,
} from '../logistics.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-empaque-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="onBackdropClick($event)">
      <div class="modal-panel slide-up" #modalPanel (click)="$event.stopPropagation()">
        <header class="modal-header">
          <h2>Generar empaque</h2>
          <button class="btn-close" (click)="onClose()">×</button>
        </header>

        <form class="modal-form" (ngSubmit)="onSubmit()" #form="ngForm">
          <div class="form-group">
            <label for="lot">Lote en fase de empaque *</label>
            <select
              id="lot"
              name="lot"
              [(ngModel)]="selectedLotId"
              required
              [disabled]="optionsLoading || !!idLote"
            >
              <option value="" disabled>Seleccione un lote</option>
              <option *ngFor="let lot of lots" [value]="lot.idLote">
                {{ lot.codigoLote }} · {{ lot.finca.nombre }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="pesoNetoKg">Peso Neto (kg) *</label>
            <input
              id="pesoNetoKg"
              type="number"
              name="pesoNetoKg"
              [(ngModel)]="model.pesoNetoKg"
              required
              min="0.1"
              step="0.1"
            />
          </div>

          <div class="form-group">
            <label for="categoria">Categoría</label>
            <select
              id="categoria"
              name="categoria"
              [(ngModel)]="model.categoria"
              [disabled]="optionsLoading"
            >
              <option [ngValue]="undefined">Sin categoría</option>
              <option *ngFor="let category of categories" [value]="category.codigo">
                {{ category.nombre }}
              </option>
            </select>
          </div>

          <div class="error-msg" *ngIf="errorMessage">{{ errorMessage }}</div>

          <footer class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="onClose()">Cancelar</button>
            <button type="submit" class="btn btn-primary" [disabled]="form.invalid || saving">
              {{ saving ? 'Generando...' : 'Generar Empaque' }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  `,
  styles: [
    `
      /* Minimal styles, reusing global modal styles assuming they exist */
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
        color: var(--color-text-primary);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        width: 100%;
        max-width: 500px;
        padding: 20px;
        box-shadow: 0 4px 12px var(--color-shadow);
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }
      .modal-header h2 {
        margin: 0;
        font-size: 1.2rem;
      }
      .btn-close {
        background: none;
        color: var(--color-text-primary);
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
      }
      .form-group {
        margin-bottom: 15px;
      }
      .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
      }
      .form-group input,
      .form-group select {
        width: 100%;
        padding: 8px;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        box-sizing: border-box;
        background: var(--color-input);
        color: var(--color-text-primary);
      }
      .error-msg {
        color: #dc3545;
        font-size: 0.9rem;
        margin-bottom: 15px;
      }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }
      .btn {
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        border: none;
      }
      .btn-secondary {
        background: var(--color-surface-strong);
        color: var(--color-text-primary);
      }
      .btn-primary {
        background: var(--color-primary);
        color: white;
      }
      .btn-primary:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
    `,
  ],
})
export class EmpaqueForm implements OnInit {
  @Input() idLote = '';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Empaque>();

  private logisticsService = inject(LogisticsService);
  private readonly cdr = inject(ChangeDetectorRef);

  model: Partial<CreateEmpaquePayload> = {};
  saving = false;
  errorMessage = '';
  categories: LogisticsCatalogOption[] = [];
  lots: Array<{ idLote: string; codigoLote: string; finca: { nombre: string } }> = [];
  selectedLotId = '';
  optionsLoading = true;

  ngOnInit(): void {
    this.selectedLotId = this.idLote;
    this.logisticsService
      .getOptions()
      .pipe(
        finalize(() => {
          this.optionsLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ categoriasCalidad, lotes }) => {
          this.categories = categoriasCalidad;
          this.lots = lotes;
        },
        error: () => (this.errorMessage = 'No se pudo cargar el catálogo de categorías'),
      });
  }

  onBackdropClick(event: MouseEvent) {
    this.onClose();
  }

  @HostListener('document:keydown.escape')
  onClose() {
    this.closed.emit();
  }

  onSubmit() {
    if (!this.model.pesoNetoKg || !this.selectedLotId) return;

    this.saving = true;
    this.errorMessage = '';

    const payload: CreateEmpaquePayload = {
      idLote: this.selectedLotId,
      pesoNetoKg: this.model.pesoNetoKg,
      categoria: this.model.categoria,
    };

    this.logisticsService
      .createEmpaque(payload)
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (empaque) => this.saved.emit(empaque),
        error: (err) => (this.errorMessage = err?.error?.message || 'Error al generar empaque'),
      });
  }
}
