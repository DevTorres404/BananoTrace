import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { jsPDF } from 'jspdf';
import { forkJoin, finalize } from 'rxjs';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import { QualityForm } from '../../quality/quality-form/quality-form';
import { LotQualityStatus, QualityService } from '../../quality/quality.service';
import { EventForm } from '../../traceability/event-form/event-form';
import { QrResult, QrService } from '../../qr/qr.service';
import { LotForm } from '../lot-form/lot-form';
import {
  LOT_STATE_LABELS,
  LotDetail as LotDetailModel,
  LotFarmOption,
  LotState,
  LotVarietyOption,
  LotsService,
} from '../lots.service';

@Component({
  selector: 'app-lot-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LotForm, EventForm, QualityForm],
  templateUrl: './lot-detail.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './lot-detail.css'],
})
export class LotDetail implements OnInit {
  private readonly lotsService = inject(LotsService);
  private readonly qualityService = inject(QualityService);
  private readonly qrService = inject(QrService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);

  lot: LotDetailModel | null = null;
  farms: LotFarmOption[] = [];
  states: LotState[] = [];
  varieties: LotVarietyOption[] = [];
  comment = '';
  isLoading = true;
  isAdvancing = false;
  isEditOpen = false;
  isEventFormOpen = false;
  isQualityFormOpen = false;
  qualityStatus: LotQualityStatus | null = null;
  qrResult: QrResult | null = null;
  isGeneratingQr = false;
  qrError = '';
  errorMessage = '';
  readonly stateLabels = LOT_STATE_LABELS;
  readonly roleLabels: Record<number, string> = {
    [ROLE_IDS.ADMINISTRADOR]: 'Administrador',
    [ROLE_IDS.SUPERVISOR_AGRICOLA]: 'Productor',
    [ROLE_IDS.CALIDAD]: 'Calidad',
    [ROLE_IDS.LOGISTICA]: 'Logística',
  };

  get canManage(): boolean {
    const role = this.authService.currentUser()?.idRol;
    return role === ROLE_IDS.ADMINISTRADOR || role === ROLE_IDS.SUPERVISOR_AGRICOLA;
  }

  get canAdvance(): boolean {
    const role = this.authService.currentUser()?.idRol;
    const responsibleRole = this.lot?.flujo?.faseActual?.idRolResponsable;
    return role === ROLE_IDS.ADMINISTRADOR || (!!role && role === responsibleRole);
  }

  ngOnInit(): void {
    this.loadDetail();
  }

  loadDetail(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.isLoading = true;
    this.errorMessage = '';
    forkJoin({ lot: this.lotsService.getLot(id), options: this.lotsService.getOptions() })
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ lot, options }) => {
          // Limitamos el timeline a 3 eventos para el resumen (ya que hay un botón de "ver historial completo")
          this.lot = {
            ...lot,
            timeline: lot.timeline.slice(0, 3)
          };
          this.farms = options.farms;
          this.states = options.states;
          this.varieties = options.varieties;
          this.loadQualityStatus(lot.idLote);
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo cargar el lote.';
        },
      });
  }

  loadQualityStatus(lotId: string): void {
    this.qualityService.getLotStatus(lotId).subscribe({
      next: (status) => {
        this.qualityStatus = status;
        this.cdr.detectChanges();
      },
    });
  }

  advance(): void {
    if (!this.lot) return;
    this.isAdvancing = true;
    this.errorMessage = '';
    this.lotsService
      .advanceLot(this.lot.idLote, this.comment.trim() || undefined)
      .pipe(
        finalize(() => {
          this.isAdvancing = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (lot) => {
          this.lot = lot;
          this.comment = '';
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo avanzar la fase del lote.';
        },
      });
  }

  onSaved(): void {
    this.isEditOpen = false;
    this.loadDetail();
  }

  onEventSaved(): void {
    this.isEventFormOpen = false;
    this.loadDetail();
  }

  onQualitySaved(): void {
    this.isQualityFormOpen = false;
    this.loadDetail();
  }

  get currentEjecucionId(): string | null {
    return this.lot?.flujo?.faseActual?.idEjecucion ?? null;
  }

  get isAdvanceBlocked(): boolean {
    return (
      this.lot?.flujo?.faseActual?.codigo === 'CALIDAD' && this.qualityStatus?.isBlocked === true
    );
  }

  get canRegisterQuality(): boolean {
    const role = this.authService.currentUser()?.idRol;
    return (
      this.lot?.flujo?.faseActual?.codigo === 'CALIDAD' &&
      (role === ROLE_IDS.ADMINISTRADOR || role === ROLE_IDS.CALIDAD)
    );
  }

  generarQr(): void {
    if (!this.lot) return;
    this.isGeneratingQr = true;
    this.qrError = '';
    this.qrResult = null;
    this.qrService
      .generar(this.lot.idLote)
      .pipe(
        finalize(() => {
          this.isGeneratingQr = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (result) => (this.qrResult = result),
        error: (error) => {
          this.qrError = error.error?.message ?? 'No se pudo generar el código QR.';
        },
      });
  }

  closeQr(): void {
    this.qrResult = null;
    this.qrError = '';
  }

  descargarQrPdf(): void {
    if (!this.qrResult || !this.lot) return;
    
    // Configurar PDF (A4 vertical por defecto)
    const doc = new jsPDF();
    
    // Título
    doc.setFontSize(22);
    doc.text('Código QR de Trazabilidad', 105, 30, { align: 'center' });
    
    // Info del lote
    doc.setFontSize(14);
    doc.text(`Lote: ${this.lot.codigoLote}`, 105, 45, { align: 'center' });
    doc.text(`Variedad: ${this.lot.variedadNombre || this.lot.variedad || 'N/A'}`, 105, 53, { align: 'center' });
    doc.text(`Finca: ${this.lot.finca.nombre}`, 105, 61, { align: 'center' });
    
    // Insertar imagen QR
    // Asumiendo que qrDataUri es base64 en formato PNG
    const qrSize = 100;
    const x = (210 - qrSize) / 2; // centrado en A4 (210mm ancho)
    doc.addImage(this.qrResult.qrDataUri, 'PNG', x, 75, qrSize, qrSize);
    
    // Enlace
    doc.setFontSize(10);
    doc.text(this.qrResult.url, 105, 185, { align: 'center' });
    
    // Guardar
    doc.save(`qr-${this.lot.codigoLote}.pdf`);
  }
}
