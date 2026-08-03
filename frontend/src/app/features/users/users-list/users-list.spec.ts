import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UsersService } from '../users.service';
import { UsersList } from './users-list';

describe('UsersList', () => {
  let fixture: ComponentFixture<UsersList>;
  let component: UsersList;
  let usersService: { getUsers: ReturnType<typeof vi.fn>; getRoles: ReturnType<typeof vi.fn> };

  const emptyPage = { data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 } };

  beforeEach(async () => {
    usersService = {
      getUsers: vi.fn().mockReturnValue(of(emptyPage)),
      getRoles: vi.fn().mockReturnValue(of([])),
    };
    await TestBed.configureTestingModule({
      imports: [UsersList],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the first page of users and the role catalog on init', () => {
    expect(usersService.getUsers).toHaveBeenCalledWith(component.filters);
    expect(usersService.getRoles).toHaveBeenCalledTimes(1);
  });

  it('opens creation inside the modal without changing route', () => {
    component.openCreateModal();

    expect(component.isUserModalOpen).toBe(true);
    expect(component.modalUserId).toBeNull();
  });

  it('opens editing for the selected user inside the same modal', () => {
    component.openEditModal('42');

    expect(component.isUserModalOpen).toBe(true);
    expect(component.modalUserId).toBe('42');
  });

  it('resets to page 1 and re-requests the server when filters change', () => {
    component.filters.page = 3;
    component.filters.q = 'ana';

    component.applyFilters();

    expect(component.filters.page).toBe(1);
    expect(usersService.getUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'ana', page: 1 }),
    );
  });

  it('does not reset the page when navigating with changePage', () => {
    component.pagination = { page: 1, pageSize: 10, total: 30, totalPages: 3 };

    component.changePage(2);

    expect(component.filters.page).toBe(2);
    expect(usersService.getUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );
  });

  it('computes active and linked counters from the currently loaded page', () => {
    component.users = [
      {
        idUsuario: '1',
        nombres: 'Ana',
        apellidos: 'Productora',
        correo: 'ana@example.com',
        idProductor: '8',
        productor: null,
        estado: true,
        fechaCreacion: '2026-01-01T00:00:00.000Z',
        fechaActualizacion: null,
        rol: { idRol: 2, nombre: 'SUPERVISOR_AGRICOLA', descripcion: null },
      },
      {
        idUsuario: '2',
        nombres: 'Luis',
        apellidos: 'Cliente',
        correo: 'luis@example.com',
        idProductor: null,
        productor: null,
        estado: false,
        fechaCreacion: '2026-01-01T00:00:00.000Z',
        fechaActualizacion: null,
        rol: { idRol: 5, nombre: 'CLIENTE', descripcion: null },
      },
    ];

    expect(component.activeUsers).toBe(1);
    expect(component.linkedUsers).toBe(1);
  });
});
