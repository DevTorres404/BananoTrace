import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { UserForm } from '../user-form/user-form';
import { UserAccount, UsersService } from '../users.service';

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [CommonModule, UserForm],
  templateUrl: './users-list.html',
  styleUrls: ['./users-list.css'],
})
export class UsersList implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly cdr = inject(ChangeDetectorRef);

  users: UserAccount[] = [];
  isLoading = true;
  updatingUserId: string | null = null;
  modalUserId: string | null = null;
  isUserModalOpen = false;
  errorMessage = '';

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.usersService
      .getUsers()
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (users) => (this.users = users),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo cargar la lista de usuarios.';
        },
      });
  }

  toggleStatus(user: UserAccount): void {
    this.updatingUserId = user.idUsuario;
    this.errorMessage = '';

    this.usersService
      .setStatus(user.idUsuario, !user.estado)
      .pipe(
        finalize(() => {
          this.updatingUserId = null;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (updated) => {
          this.users = this.users.map((item) =>
            item.idUsuario === updated.idUsuario ? updated : item,
          );
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo actualizar el usuario.';
        },
      });
  }

  openCreateModal(): void {
    this.modalUserId = null;
    this.isUserModalOpen = true;
  }

  openEditModal(userId: string): void {
    this.modalUserId = userId;
    this.isUserModalOpen = true;
  }

  closeUserModal(): void {
    this.isUserModalOpen = false;
    this.modalUserId = null;
  }

  onUserSaved(): void {
    this.closeUserModal();
    this.loadUsers();
  }

  getRoleClass(roleName: string): string {
    return `role-${roleName.toLowerCase().replace(/_/g, '-')}`;
  }
}
