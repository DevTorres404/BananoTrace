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
  CatalogOption,
  Certification,
  CertificationPayload,
  Farm,
  FarmsService,
} from '../farms.service';

@Component({
  selector: 'app-certification-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './certification-form.html',
  styleUrls: ['../farm-form/farm-form.css'],
})
export class CertificationForm implements OnInit, OnDestroy {
  @Input() certification: Certification | null = null;
  @Input() farms: Farm[] = [];
  @Input() initialFarmId: string | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Certification>();

  private readonly farmsService = inject(FarmsService);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private previousBodyOverflow = '';

  farmId = '';
  model: CertificationPayload = this.emptyModel();
  isSaving = false;
  errorMessage = '';
  certificationTypes: CatalogOption[] = [];
  certificationIssuers: CatalogOption[] = [];
  optionsLoading = true;

  get isEditMode(): boolean {
    return this.certification !== null;
  }

  ngOnInit(): void {
    this.previousBodyOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
    this.farmId = this.initialFarmId ?? this.certification?.idFinca ?? '';
    if (this.certification) this.populate(this.certification);
    this.farmsService
      .getCertificationOptions()
      .pipe(
        finalize(() => {
          this.optionsLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ types, issuers }) => {
          this.certificationTypes = types;
          this.certificationIssuers = issuers;
        },
        error: () => {
          this.errorMessage = 'No se pudieron cargar los catálogos de certificación.';
        },
      });
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
    this.errorMessage = '';
    const payload: CertificationPayload = {
      tipoCertificacion: this.model.tipoCertificacion.trim(),
      entidadEmisora: this.model.entidadEmisora.trim(),
      numeroCertificado: this.model.numeroCertificado.trim().toUpperCase(),
      fechaEmision: this.model.fechaEmision,
      fechaVencimiento: this.model.fechaVencimiento || null,
      documentoUrl: this.model.documentoUrl?.trim() || null,
    };
    this.isSaving = true;
    const request = this.certification
      ? this.farmsService.updateCertification(
          this.certification.idFinca,
          this.certification.idCertificacion,
          payload,
        )
      : this.farmsService.createCertification(this.farmId, payload);
    request
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (certification) => this.saved.emit(certification),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo guardar la certificación.';
        },
      });
  }

  private emptyModel(): CertificationPayload {
    return {
      tipoCertificacion: '',
      entidadEmisora: '',
      numeroCertificado: '',
      fechaEmision: '',
      fechaVencimiento: null,
      documentoUrl: null,
    };
  }

  private populate(certification: Certification): void {
    this.model = {
      tipoCertificacion: certification.tipoCertificacionCodigo,
      entidadEmisora: certification.entidadEmisoraCodigo,
      numeroCertificado: certification.numeroCertificado,
      fechaEmision: certification.fechaEmision.slice(0, 10),
      fechaVencimiento: certification.fechaVencimiento?.slice(0, 10) ?? null,
      documentoUrl: certification.documentoUrl,
    };
  }
}
