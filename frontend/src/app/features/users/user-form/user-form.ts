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
import { UserAccount, UserPayload, UserRole, UsersService } from '../users.service';
import { ProducersService, Producer } from '../../producers/producers.service';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-form.html',
  styleUrls: ['./user-form.css'],
})
export class UserForm implements OnInit, OnDestroy {
  @Input() userId: string | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<UserAccount>();
  @ViewChild('firstField') private firstField?: ElementRef<HTMLInputElement>;

  private readonly usersService = inject(UsersService);
  private readonly producersService = inject(ProducersService);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private previousBodyOverflow = '';

  user: UserPayload = this.emptyUser();
  roles: UserRole[] = [];
  producers: Producer[] = [];
  isLoadingData = true;
  isSaving = false;
  errorMessage = '';

  get isEditMode(): boolean {
    return this.userId !== null;
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

    const payload: UserPayload = {
      nombres: this.user.nombres.trim(),
      apellidos: this.user.apellidos.trim(),
      correo: this.user.correo.trim().toLowerCase(),
      idRol: Number(this.user.idRol),
      idProductor: this.user.idProductor || null,
    };

    if (this.user.clave) payload.clave = this.user.clave;
    if (!this.isEditMode && !payload.clave) {
      this.errorMessage = 'La contraseña es obligatoria.';
      return;
    }

    if ((payload.idRol === 2 || payload.idRol === 6) && !payload.idProductor) {
      this.errorMessage = 'Debe seleccionar un Productor Vinculado para los roles Supervisor y Gerente.';
      return;
    }

    this.isSaving = true;
    const request = this.userId
      ? this.usersService.updateUser(this.userId, payload)
      : this.usersService.createUser(payload);

    request
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (user) => this.saved.emit(user),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo guardar el usuario.';
          this.cdr.detectChanges();
        },
      });
  }

  private loadForm(): void {
    const userRequest = this.userId ? this.usersService.getUser(this.userId) : of(null);

    forkJoin({
      roles: this.usersService.getRoles(),
      producers: this.producersService.getProducers(),
      user: userRequest,
    })
      .pipe(
        finalize(() => {
          this.isLoadingData = false;
          this.cdr.detectChanges();
          queueMicrotask(() => this.firstField?.nativeElement.focus());
        }),
      )
      .subscribe({
        next: ({ roles, producers, user }) => {
          this.roles = roles.filter(r => r.idRol !== 1); // Excluir ADMINISTRADOR
          this.producers = producers;
          if (user) this.populateForm(user);
        },
        error: (error) => {
          this.errorMessage =
            error.error?.message ?? 'No se pudieron cargar los datos del formulario.';
          this.cdr.detectChanges();
        },
      });
  }

  get isProducerRole(): boolean {
    return Number(this.user.idRol) === 2 || Number(this.user.idRol) === 6;
  }

  private emptyUser(): UserPayload {
    return { nombres: '', apellidos: '', correo: '', clave: '', idRol: 0, idProductor: null };
  }

  private populateForm(user: UserAccount): void {
    this.user = {
      nombres: user.nombres,
      apellidos: user.apellidos,
      correo: user.correo,
      clave: '',
      idRol: user.rol.idRol,
      idProductor: user.idProductor,
    };
  }
}
