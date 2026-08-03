import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import { ProducersService } from '../producers.service';
import { ProducersList } from './producers-list';

describe('ProducersList', () => {
  let fixture: ComponentFixture<ProducersList>;
  let component: ProducersList;
  let producersService: { getProducers: ReturnType<typeof vi.fn>; deleteProducer: ReturnType<typeof vi.fn> };

  const emptyPage = { data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 } };

  beforeEach(async () => {
    producersService = {
      getProducers: vi.fn().mockReturnValue(of(emptyPage)),
      deleteProducer: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [ProducersList],
      providers: [
        { provide: ProducersService, useValue: producersService },
        {
          provide: AuthService,
          useValue: { currentUser: vi.fn().mockReturnValue({ idRol: ROLE_IDS.ADMINISTRADOR }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProducersList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the first page of producers on init', () => {
    expect(producersService.getProducers).toHaveBeenCalledWith(component.filters);
  });

  it('opens creation inside the modal for administrators', () => {
    component.openCreateModal();

    expect(component.isAdmin).toBe(true);
    expect(component.isFormModalOpen).toBe(true);
    expect(component.modalProducerId).toBeNull();
  });

  it('resets to page 1 and re-requests the server when the linkage filter changes', () => {
    component.filters.page = 2;
    component.filters.vinculado = 'true';

    component.applyFilters();

    expect(component.filters.page).toBe(1);
    expect(producersService.getProducers).toHaveBeenLastCalledWith(
      expect.objectContaining({ vinculado: 'true', page: 1 }),
    );
  });

  it('calculates linkage and farm metrics from the currently loaded page', () => {
    component.producers = [
      {
        idProductor: '1',
        identificacion: 'CO-100',
        nombreRazonSocial: 'Productor Colombia',
        telefono: null,
        correo: 'colombia@example.com',
        direccion: null,
        fechaActualizacion: null,
        totalFincas: 3,
        totalUsuarios: 1,
        usuarios: [
          {
            idUsuario: '7',
            nombres: 'Ana',
            apellidos: 'Campo',
            correo: 'ana@example.com',
            estado: true,
          },
        ],
      },
      {
        idProductor: '2',
        identificacion: 'PE-200',
        nombreRazonSocial: 'Productor Perú',
        telefono: null,
        correo: null,
        direccion: null,
        fechaActualizacion: null,
        totalFincas: 2,
        totalUsuarios: 0,
        usuarios: [],
      },
    ];

    expect(component.linkedProducers).toBe(1);
    expect(component.totalFarms).toBe(5);
  });
});
