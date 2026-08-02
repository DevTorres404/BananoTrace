import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UsersService } from '../users.service';
import { UsersList } from './users-list';

describe('UsersList', () => {
  let fixture: ComponentFixture<UsersList>;
  let component: UsersList;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsersList],
      providers: [
        {
          provide: UsersService,
          useValue: { getUsers: vi.fn().mockReturnValue(of([])), setStatus: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersList);
    component = fixture.componentInstance;
    fixture.detectChanges();
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

  it('filters users by text, role and status', () => {
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
        rol: { idRol: 2, nombre: 'PRODUCTOR', descripcion: null },
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

    component.searchTerm = 'ana';
    component.roleFilter = 'PRODUCTOR';
    component.statusFilter = 'active';

    expect(component.visibleUsers.map((user) => user.idUsuario)).toEqual(['1']);
    expect(component.activeUsers).toBe(1);
    expect(component.linkedUsers).toBe(1);
  });
});
