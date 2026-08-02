import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  QualityControl,
  QualityControlPayload,
  QualityCategory,
  QualityResult,
  QualityService,
} from '../quality.service';

interface ResultOption {
  value: QualityResult;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-quality-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quality-form.html',
  styleUrls: ['./quality-form.css'],
})
export class QualityForm implements OnInit {
  @Input({ required: true }) idEjecucion!: string;
  @Input({ required: true }) idLote!: string;
  @Input({ required: true }) codigoLote!: string;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<QualityControl>();

  @ViewChild('modalPanel') private modalPanel?: ElementRef<HTMLElement>;

  private readonly qualityService = inject(QualityService);

  model: Partial<QualityControlPayload> & { resultado?: QualityResult } = {};
  rejectionPct: number | null = null;
  saving = false;
  errorMessage: string | null = null;
  categories: QualityCategory[] = [];
  categoriesLoading = true;

  readonly results: ResultOption[] = [
    { value: 'APROBADO', label: 'Aprobado', icon: '✅' },
    { value: 'OBSERVADO', label: 'Observado', icon: '⚠️' },
    { value: 'RECHAZADO', label: 'Rechazado', icon: '❌' },
  ];

  ngOnInit(): void {
    this.qualityService
      .getCategories()
      .pipe(finalize(() => (this.categoriesLoading = false)))
      .subscribe({
        next: (categories) => (this.categories = categories),
        error: () => {
          this.errorMessage = 'No se pudo cargar el catálogo de categorías.';
        },
      });
  }

  calcRejection(): void {
    const muestra = Number(this.model.pesoMuestraKg);
    const rechazado = Number(this.model.pesoRechazadoKg);
    if (muestra > 0 && !isNaN(rechazado)) {
      this.rejectionPct = Number(((rechazado / muestra) * 100).toFixed(2));
    } else {
      this.rejectionPct = null;
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.modalPanel && !this.modalPanel.nativeElement.contains(event.target as Node)) {
      this.onClose();
    }
  }

  @HostListener('document:keydown.escape')
  onClose(): void {
    this.closed.emit();
  }

  onSubmit(): void {
    if (this.saving || !this.model.resultado) return;

    const payload: QualityControlPayload = {
      idEjecucion: this.idEjecucion,
      idLote: this.idLote,
      resultado: this.model.resultado,
      categoriaCalidad: this.model.categoriaCalidad || undefined,
      calibreMm: this.model.calibreMm ?? null,
      pesoMuestraKg: this.model.pesoMuestraKg ?? null,
      pesoRechazadoKg: this.model.pesoRechazadoKg ?? null,
      observaciones: this.model.observaciones || undefined,
    };

    this.saving = true;
    this.errorMessage = null;

    this.qualityService
      .createControl(payload)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (control) => this.saved.emit(control),
        error: (err) => {
          this.errorMessage = err?.error?.message || 'Error al registrar la inspección';
        },
      });
  }
}
