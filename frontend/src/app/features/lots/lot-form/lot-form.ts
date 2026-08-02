import { CommonModule, DOCUMENT } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  LOT_STATE_LABELS,
  Lot,
  LotFarmOption,
  LotPayload,
  LotState,
  LotVarietyOption,
  LotsService,
} from '../lots.service';

@Component({
  selector: 'app-lot-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lot-form.html',
  styleUrls: ['../../farms/farm-form/farm-form.css', './lot-form.css'],
})
export class LotForm implements OnInit, OnDestroy {
  @Input() lot: Lot | null = null;
  @Input() farms: LotFarmOption[] = [];
  @Input() states: LotState[] = [];
  @Input() varieties: LotVarietyOption[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private readonly lotsService = inject(LotsService);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private previousBodyOverflow = '';

  model: LotPayload = this.emptyModel();
  isSaving = false;
  errorMessage = '';
  readonly stateLabels = LOT_STATE_LABELS;

  get isEditMode(): boolean {
    return this.lot !== null;
  }

  ngOnInit(): void {
    this.previousBodyOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
    if (this.lot) this.populate(this.lot);
  }

  ngOnDestroy(): void {
    this.document.body.style.overflow = this.previousBodyOverflow;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    if (!this.isSaving) this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  onSubmit(): void {
    const payload: LotPayload = {
      idFinca: this.model.idFinca,
      variedad: this.model.variedad.trim(),
      fechaSiembra: this.model.fechaSiembra || null,
      fechaEstimadaCosecha: this.model.fechaEstimadaCosecha || null,
      cantidadPlantas: this.model.cantidadPlantas || null,
    };
    if (this.isEditMode) {
      payload.fechaCosecha = this.model.fechaCosecha || null;
      payload.pesoCosechadoKg = this.model.pesoCosechadoKg || null;
      payload.estado = this.model.estado;
    }

    this.isSaving = true;
    this.errorMessage = '';
    const request = this.lot
      ? this.lotsService.updateLot(this.lot.idLote, payload)
      : this.lotsService.createLot(payload);
    request
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => this.saved.emit(),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo guardar el lote.';
        },
      });
  }

  private emptyModel(): LotPayload {
    return {
      idFinca: '',
      variedad: 'CAVENDISH',
      fechaSiembra: null,
      fechaEstimadaCosecha: null,
      cantidadPlantas: null,
      fechaCosecha: null,
      pesoCosechadoKg: null,
      estado: 'PLANIFICADO',
    };
  }

  private populate(lot: Lot): void {
    this.model = {
      idFinca: lot.idFinca,
      variedad: lot.variedad ?? '',
      fechaSiembra: lot.fechaSiembra?.slice(0, 10) ?? null,
      fechaEstimadaCosecha: lot.fechaEstimadaCosecha?.slice(0, 10) ?? null,
      cantidadPlantas: lot.cantidadPlantas,
      fechaCosecha: lot.fechaCosecha?.slice(0, 10) ?? null,
      pesoCosechadoKg: lot.pesoCosechadoKg,
      estado: lot.estado,
    };
  }
}
