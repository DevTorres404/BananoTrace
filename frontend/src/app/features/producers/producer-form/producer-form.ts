import { CommonModule, DOCUMENT } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import {
  AssignableProducerUser,
  LinkedProducerUser,
  Producer,
  ProducerPayload,
  ProducersService,
} from '../producers.service';

@Component({
  selector: 'app-producer-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './producer-form.html',
  styleUrls: ['./producer-form.css'],
})
export class ProducerForm implements OnInit, OnDestroy {
  @Input() producerId: string | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Producer>();
  @ViewChild('firstField') private firstField?: ElementRef<HTMLInputElement>;

  private readonly producersService = inject(ProducersService);
  private readonly authService = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private previousBodyOverflow = '';

  producer: ProducerPayload = this.emptyProducer();
  assignableUsers: AssignableProducerUser[] = [];
  linkedUsers: LinkedProducerUser[] = [];
  isLoadingData = true;
  isSaving = false;
  errorMessage = '';

  get isEditMode(): boolean {
    return this.producerId !== null;
  }

  get isAdmin(): boolean {
    return this.authService.currentUser()?.idRol === ROLE_IDS.ADMINISTRADOR;
  }

  ngOnInit(): void {
    this.previousBodyOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';

    this.loadForm();
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

    const payload: ProducerPayload = {
      identificacion: this.producer.identificacion.trim(),
      nombreRazonSocial: this.producer.nombreRazonSocial.trim(),
      telefono: this.producer.telefono?.trim() || '',
      correo: this.producer.correo?.trim().toLowerCase() || '',
      direccion: this.producer.direccion?.trim() || '',
    };
    if (this.isAdmin) payload.idUsuarios = this.producer.idUsuarios ?? [];

    this.isSaving = true;
    const request = this.producerId
      ? this.producersService.updateProducer(this.producerId, payload)
      : this.producersService.createProducer(payload);

    request
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (producer) => this.saved.emit(producer),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo guardar el productor.';
          this.cdr.detectChanges();
        },
      });
  }

  private loadForm(): void {
    const producerRequest = this.producerId
      ? this.producersService.getProducer(this.producerId)
      : of(null);
    const usersRequest = this.isAdmin
      ? this.producersService.getAssignableUsers(this.producerId ?? undefined)
      : of([] as AssignableProducerUser[]);

    forkJoin({ producer: producerRequest, users: usersRequest })
      .pipe(
        finalize(() => {
          this.isLoadingData = false;
          this.cdr.detectChanges();
          queueMicrotask(() => this.firstField?.nativeElement.focus());
        }),
      )
      .subscribe({
        next: ({ producer, users }) => {
          this.assignableUsers = users;
          if (producer) this.populateForm(producer);
        },
        error: (error) => {
          this.errorMessage =
            error.error?.message ?? 'No se pudieron cargar los datos del productor.';
          this.cdr.detectChanges();
        },
      });
  }

  private emptyProducer(): ProducerPayload {
    return {
      identificacion: '',
      nombreRazonSocial: '',
      telefono: '',
      correo: '',
      direccion: '',
      idUsuarios: [],
    };
  }

  private populateForm(producer: Producer): void {
    this.linkedUsers = producer.usuarios;
    this.producer = {
      identificacion: producer.identificacion,
      nombreRazonSocial: producer.nombreRazonSocial,
      telefono: producer.telefono ?? '',
      correo: producer.correo ?? '',
      direccion: producer.direccion ?? '',
      idUsuarios: producer.usuarios.map((user) => user.idUsuario),
    };
  }
}
