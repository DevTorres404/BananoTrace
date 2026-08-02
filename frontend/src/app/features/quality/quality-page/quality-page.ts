import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  QualityControl,
  QualityResult,
  QualitySummary,
  QUALITY_RESULT_LABELS,
  QualityService,
} from '../quality.service';

@Component({
  selector: 'app-quality-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quality-page.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './quality-page.css'],
})
export class QualityPage implements OnInit {
  private readonly qualityService = inject(QualityService);
  private readonly cdr = inject(ChangeDetectorRef);

  controls: QualityControl[] = [];
  summary: QualitySummary | null = null;
  isLoading = false;
  errorMessage = '';
  resultFilter: QualityResult | '' = '';
  lotCodeSearch = '';

  readonly resultLabels = QUALITY_RESULT_LABELS;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.qualityService
      .getControls({
        resultado: this.resultFilter || undefined,
        search: this.lotCodeSearch.trim() || undefined,
      })
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ data, summary }) => {
          this.controls = data;
          this.summary = summary;
        },
        error: (err) => {
          this.errorMessage = err?.error?.message || 'No se pudo cargar el historial.';
        },
      });
  }

  applyFilters(): void {
    this.load();
  }

  clearFilters(): void {
    this.lotCodeSearch = '';
    this.resultFilter = '';
    this.load();
  }

  getBadgeClass(result: QualityResult): string {
    const map: Record<QualityResult, string> = {
      APROBADO: 'badge badge-approved',
      OBSERVADO: 'badge badge-observed',
      RECHAZADO: 'badge badge-rejected',
    };
    return map[result];
  }

  getPctClass(pct: number): string {
    if (pct <= 5) return 'pct-ok';
    if (pct <= 15) return 'pct-warn';
    return 'pct-high';
  }
}
