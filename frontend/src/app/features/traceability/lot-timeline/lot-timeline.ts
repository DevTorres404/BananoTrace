import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { LotsService } from '../../lots/lots.service';
import { TraceabilityService } from '../traceability.service';

@Component({
  selector: 'app-lot-timeline',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './lot-timeline.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './lot-timeline.css'],
})
export class LotTimelinePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly lotsService = inject(LotsService);
  private readonly traceabilityService = inject(TraceabilityService);
  private readonly cdr = inject(ChangeDetectorRef);

  lotId = '';
  lotCode = '';
  events: Array<{
    idEvento: string;
    fechaEvento: string;
    tipoEvento: { nombre: string };
    descripcion: string | null;
    usuario: string;
    ubicacion: string | null;
    fase: { nombre: string };
  }> = [];
  isLoading = true;
  errorMessage = '';

  ngOnInit(): void {
    this.lotId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.lotId) {
      this.errorMessage = 'No se encontró el lote solicitado.';
      this.isLoading = false;
      return;
    }

    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.lotsService
      .getLot(this.lotId)
      .pipe(
        switchMap((lot) => {
          this.lotCode = lot.codigoLote;
          return this.traceabilityService.getTimeline(lot.idUnidad);
        }),
        finalize(() => this.finishLoading())
      )
      .subscribe({
        next: (timeline) => {
          this.events = timeline;
        },
        error: () => {
          this.errorMessage = 'No se pudo cargar la línea de tiempo del lote.';
        },
      });
  }

  private finishLoading(): void {
    this.isLoading = false;
    this.cdr.detectChanges();
  }
}
