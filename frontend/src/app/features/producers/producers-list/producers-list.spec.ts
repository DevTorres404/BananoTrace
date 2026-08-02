import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import { ProducersService } from '../producers.service';
import { ProducersList } from './producers-list';

describe('ProducersList', () => {
  let fixture: ComponentFixture<ProducersList>;
  let component: ProducersList;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProducersList],
      providers: [
        {
          provide: ProducersService,
          useValue: { getProducers: vi.fn().mockReturnValue(of([])), deleteProducer: vi.fn() },
        },
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

  it('opens creation inside the modal for administrators', () => {
    component.openCreateModal();

    expect(component.isAdmin).toBe(true);
    expect(component.isFormModalOpen).toBe(true);
    expect(component.modalProducerId).toBeNull();
  });

  it('calculates metrics and filters producers by account linkage', () => {
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
    component.accountFilter = 'linked';

    expect(component.visibleProducers.map((producer) => producer.idProductor)).toEqual(['1']);
    expect(component.linkedProducers).toBe(1);
    expect(component.totalFarms).toBe(5);
  });
});
