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
  CreateEventPayload,
  EVENT_TYPE_ICONS,
  EventType,
  TraceabilityEvent,
  TraceabilityService,
} from '../traceability.service';

@Component({
  selector: 'app-event-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './event-form.html',
  styleUrls: ['./event-form.css'],
})
export class EventForm implements OnInit {
  /** ID of the trackable unit (from the lot) */
  @Input({ required: true }) idUnidad!: string;
  /** ID of the current phase execution */
  @Input({ required: true }) idEjecucion!: string;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<TraceabilityEvent>();

  @ViewChild('modalPanel') private modalPanel?: ElementRef<HTMLElement>;

  private readonly traceabilityService = inject(TraceabilityService);

  eventTypes: EventType[] = [];
  model: Partial<CreateEventPayload> = {
    idTipoEvento: undefined,
    fechaEvento: this.toLocalDatetimeString(new Date()),
    ubicacion: '',
    descripcion: '',
  };
  datosAdicionalesRaw = '';
  jsonError: string | null = null;
  saving = false;
  errorMessage: string | null = null;

  ngOnInit(): void {
    this.traceabilityService.getEventTypes().subscribe({
      next: (types) => (this.eventTypes = types),
      error: () => (this.errorMessage = 'No se pudieron cargar los tipos de evento'),
    });
  }

  iconFor(nombre: string): string {
    return EVENT_TYPE_ICONS[nombre] ?? '📌';
  }

  onBackdropClick(event: MouseEvent): void {
    if (
      this.modalPanel &&
      !this.modalPanel.nativeElement.contains(event.target as Node)
    ) {
      this.onClose();
    }
  }

  @HostListener('document:keydown.escape')
  onClose(): void {
    this.closed.emit();
  }

  onSubmit(): void {
    if (this.saving) return;

    // Validate JSON field
    let parsedData: Record<string, unknown> = {};
    if (this.datosAdicionalesRaw.trim()) {
      try {
        parsedData = JSON.parse(this.datosAdicionalesRaw.trim());
        this.jsonError = null;
      } catch {
        this.jsonError = 'El JSON ingresado no es válido';
        return;
      }
    }

    let fechaIso = '';
    try {
      fechaIso = new Date(this.model.fechaEvento!).toISOString();
    } catch {
      this.errorMessage = 'La fecha del evento es inválida';
      return;
    }

    const payload: CreateEventPayload = {
      idUnidad: this.idUnidad,
      idEjecucion: this.idEjecucion,
      idTipoEvento: this.model.idTipoEvento!,
      fechaEvento: fechaIso,
      ubicacion: this.model.ubicacion?.trim() || undefined,
      descripcion: this.model.descripcion?.trim() || undefined,
      datosAdicionales: Object.keys(parsedData).length ? parsedData : undefined,
    };

    this.saving = true;
    this.errorMessage = null;

    this.traceabilityService
      .createEvent(payload)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (event) => this.saved.emit(event),
        error: (err) => {
          this.errorMessage =
            err?.error?.message || 'Ocurrió un error al registrar el evento';
        },
      });
  }

  private toLocalDatetimeString(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }
}
