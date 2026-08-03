import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { UserForm } from '../user-form/user-form';
import { UserAccount, UserFilters, UserRole, UsersService } from '../users.service';

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [CommonModule, FormsModule, UserForm],
  templateUrl: './users-list.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './users-list.css'],
})
export class UsersList implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly cdr = inject(ChangeDetectorRef);

  users: UserAccount[] = [];
  roles: UserRole[] = [];
  pagination = { page: 1, pageSize: 10, total: 0, totalPages: 1 };
  filters: UserFilters = { q: '', idRol: '', estado: '', page: 1, pageSize: 10 };
  isLoading = true;
  updatingUserId: string | null = null;
  modalUserId: string | null = null;
  isUserModalOpen = false;
  errorMessage = '';

  get activeUsers(): number {
    return this.users.filter((user) => user.estado).length;
  }

  get linkedUsers(): number {
    return this.users.filter((user) => user.idProductor !== null).length;
  }

  ngOnInit(): void {
    this.loadInitial();
  }

  loadInitial(): void {
    this.isLoading = true;
    this.errorMessage = '';
    forkJoin({
      page: this.usersService.getUsers(this.filters),
      roles: this.usersService.getRoles(),
    })
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ page, roles }) => {
          this.users = page.data;
          this.pagination = page.pagination;
          this.roles = roles;
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo cargar la lista de usuarios.';
        },
      });
  }

  applyFilters(resetPage = true): void {
    if (resetPage) this.filters.page = 1;
    this.isLoading = true;
    this.errorMessage = '';
    this.usersService
      .getUsers(this.filters)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (page) => {
          this.users = page.data;
          this.pagination = page.pagination;
        },
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudieron aplicar los filtros.';
        },
      });
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pagination.totalPages) return;
    this.filters.page = page;
    this.applyFilters(false);
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
    this.loadInitial();
  }

  clearFilters(): void {
    this.filters = { q: '', idRol: '', estado: '', page: 1, pageSize: 10 };
    this.applyFilters(true);
  }

  getRoleClass(roleName: string): string {
    return `role-${roleName.toLowerCase().replace(/_/g, '-')}`;
  }
}
