import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LotsService } from './lots.service';

describe('LotsService', () => {
  let service: LotsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LotsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LotsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests a paginated lot list with filters', () => {
    service.getLots({ idFinca: '5', estado: 'EN_PRODUCCION', page: 2, pageSize: 10 }).subscribe();

    const request = httpMock.expectOne(
      (candidate) =>
        candidate.url === '/api/lots' &&
        candidate.params.get('idFinca') === '5' &&
        candidate.params.get('estado') === 'EN_PRODUCCION' &&
        candidate.params.get('page') === '2',
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      data: [],
      summary: { totalLots: 0, activeLots: 0, totalPlants: 0 },
      pagination: { page: 2, pageSize: 10, total: 0, totalPages: 1 },
    });
  });

  it('creates a lot without sending a user-entered code', () => {
    const payload = { idFinca: '5', variedad: 'Cavendish', cantidadPlantas: 1200 };
    service.createLot(payload).subscribe();

    const request = httpMock.expectOne('/api/lots');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    expect(request.request.body.codigoLote).toBeUndefined();
    request.flush({});
  });

  it('loads the complete lot detail', () => {
    service.getLot('8').subscribe();
    const request = httpMock.expectOne('/api/lots/8');
    expect(request.request.method).toBe('GET');
    request.flush({});
  });

  it('advances the flow through its dedicated endpoint', () => {
    service.advanceLot('8', 'Aprobado').subscribe();
    const request = httpMock.expectOne('/api/lots/8/advance');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ comentario: 'Aprobado' });
    request.flush({});
  });
});
