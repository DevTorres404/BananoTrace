import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProducersService } from './producers.service';

describe('ProducersService', () => {
  let service: ProducersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ProducersService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProducersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads PRODUCTOR accounts assignable to an existing producer', () => {
    service.getAssignableUsers('5').subscribe();

    const request = httpMock.expectOne('/api/producers/assignable-users?producerId=5');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('sends linked account identifiers when creating a producer', () => {
    const payload = {
      identificacion: '0912345678001',
      nombreRazonSocial: 'Productor BananoTrace',
      idUsuarios: ['7'],
    };

    service.createProducer(payload).subscribe();

    const request = httpMock.expectOne('/api/producers');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({});
  });
});
