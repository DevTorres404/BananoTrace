import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import {
  CreateDocumentPayload,
  DocumentType,
  EVENT_TYPE_ICONS,
  EventFilters,
  EventType,
  TraceabilityDocument,
  TraceabilityEvent,
  TraceabilityPage,
  TraceabilityService,
} from '../traceability.service';

@Component({
  selector: 'app-events-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './events-page.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './events-page.css'],
})
export class EventsPage implements OnInit {
  private readonly service = inject(TraceabilityService);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  events: TraceabilityEvent[] = [];
  eventTypes: EventType[] = [];
  documentTypes: DocumentType[] = [];
  users: Array<{ idUsuario: string; nombre: string }> = [];
  filters: EventFilters = { page: 1, pageSize: 15 };
  summary = { total: 0, units: 0, documents: 0 };
  pagination = { page: 1, pageSize: 15, total: 0, totalPages: 1 };
  isLoading = true;
  errorMessage = '';

  selectedEvent: TraceabilityEvent | null = null;
  documentModel: CreateDocumentPayload = { nombre: '', tipo: '', url: '' };
  isSavingDocument = false;
  documentError = '';

  ngOnInit(): void {
    forkJoin({ options: this.service.getOptions(), page: this.service.getEvents(this.filters) })
      .pipe(finalize(() => this.finishLoading()))
      .subscribe({
        next: ({ options, page }) => {
          this.eventTypes = options.eventTypes;
          this.documentTypes = options.documentTypes;
          this.users = options.users;
          this.applyPage(page);
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudieron cargar los eventos.';
        },
      });
  }

  load(resetPage = true): void {
    if (resetPage) this.filters.page = 1;
    this.isLoading = true;
    this.errorMessage = '';
    this.service
      .getEvents(this.filters)
      .pipe(finalize(() => this.finishLoading()))
      .subscribe({
        next: (page) => this.applyPage(page),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudieron aplicar los filtros.';
        },
      });
  }

  clearFilters(): void {
    this.filters = { page: 1, pageSize: 15 };
    this.load(false);
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pagination.totalPages) return;
    this.filters.page = page;
    this.load(false);
  }

  iconFor(type: string): string {
    return EVENT_TYPE_ICONS[type] ?? '📌';
  }

  canAttach(event: TraceabilityEvent): boolean {
    const user = this.auth.currentUser();
    return user?.idRol === ROLE_IDS.ADMINISTRADOR || user?.sub === event.idUsuario;
  }

  openDocumentModal(event: TraceabilityEvent): void {
    this.selectedEvent = event;
    this.documentModel = { nombre: '', tipo: '', url: '' };
    this.documentError = '';
  }

  closeDocumentModal(): void {
    if (!this.isSavingDocument) this.selectedEvent = null;
  }

  saveDocument(): void {
    if (!this.selectedEvent || this.isSavingDocument) return;
    this.isSavingDocument = true;
    this.documentError = '';
    const payload = {
      nombre: this.documentModel.nombre.trim(),
      tipo: this.documentModel.tipo,
      url: this.documentModel.url.trim(),
    };
    this.service
      .addDocument(this.selectedEvent.idEvento, payload)
      .pipe(
        finalize(() => {
          this.isSavingDocument = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (document) => this.onDocumentSaved(document),
        error: (error) => {
          this.documentError = error.error?.message ?? 'No se pudo vincular el documento.';
        },
      });
  }

  private onDocumentSaved(document: TraceabilityDocument): void {
    if (!this.selectedEvent) return;
    this.selectedEvent.documentos = [...this.selectedEvent.documentos, document];
    this.summary.documents += 1;
    this.selectedEvent = null;
  }

  private applyPage(page: TraceabilityPage): void {
    this.events = page.data;
    this.summary = page.summary;
    this.pagination = page.pagination;
  }

  private finishLoading(): void {
    this.isLoading = false;
    this.cdr.detectChanges();
  }
}
