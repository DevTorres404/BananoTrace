import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ProducersService } from '../../producers/producers.service';
import { UserAccount, UsersService } from '../users.service';
import { UserForm } from './user-form';

describe('UserForm modal', () => {
  let fixture: ComponentFixture<UserForm>;
  let component: UserForm;
  let usersService: {
    getRoles: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
  };

  const account: UserAccount = {
    idUsuario: '12',
    nombres: 'Ana',
    apellidos: 'Torres',
    correo: 'ana@coil.com',
    idProductor: '4',
    productor: {
      idProductor: '4',
      identificacion: '0912345678001',
      nombreRazonSocial: 'Productor BananoTrace',
    },
    estado: true,
    fechaCreacion: '2026-08-02T00:00:00.000Z',
    fechaActualizacion: null,
    rol: { idRol: 2, nombre: 'SUPERVISOR_AGRICOLA', descripcion: null },
  };

  beforeEach(async () => {
    usersService = {
      getRoles: vi.fn().mockReturnValue(of([account.rol])),
      getUser: vi.fn().mockReturnValue(of(account)),
      createUser: vi.fn().mockReturnValue(of(account)),
      updateUser: vi.fn().mockReturnValue(of(account)),
    };

    await TestBed.configureTestingModule({
      imports: [UserForm],
      providers: [
        { provide: UsersService, useValue: usersService },
        {
          provide: ProducersService,
          useValue: {
            getProducers: vi.fn().mockReturnValue(
              of({ data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 } }),
            ),
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  it('creates a user and emits the saved account', () => {
    fixture = TestBed.createComponent(UserForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
    const savedSpy = vi.spyOn(component.saved, 'emit');
    component.user = {
      nombres: ' Ana ',
      apellidos: ' Torres ',
      correo: ' ANA@COIL.COM ',
      clave: 'password123',
      idRol: 2,
    };

    component.onSubmit();

    expect(usersService.createUser).toHaveBeenCalledWith({
      nombres: 'Ana',
      apellidos: 'Torres',
      correo: 'ana@coil.com',
      clave: 'password123',
      idRol: 2,
    });
    expect(savedSpy).toHaveBeenCalledWith(account);
  });

  it('loads an existing user and updates it without requiring a password', () => {
    fixture = TestBed.createComponent(UserForm);
    fixture.componentRef.setInput('userId', '12');
    component = fixture.componentInstance;
    fixture.detectChanges();
    const savedSpy = vi.spyOn(component.saved, 'emit');

    component.onSubmit();

    expect(usersService.getUser).toHaveBeenCalledWith('12');
    expect(usersService.updateUser).toHaveBeenCalledWith(
      '12',
      expect.objectContaining({ correo: 'ana@coil.com', idRol: 2 }),
    );
    expect(savedSpy).toHaveBeenCalledWith(account);
  });
});
