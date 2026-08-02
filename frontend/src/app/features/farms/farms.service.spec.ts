import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FarmsService } from './farms.service';

describe('FarmsService', () => {
  let service: FarmsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FarmsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FarmsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends only populated farm filters', () => {
    service
      .getFarms({ pais: 'Ecuador', region: 'Los Ríos', localidad: '', estado: 'true' })
      .subscribe();

    const request = httpMock.expectOne(
      (candidate) =>
        candidate.url === '/api/farms' &&
        candidate.params.get('pais') === 'Ecuador' &&
        candidate.params.get('region') === 'Los Ríos' &&
        candidate.params.get('estado') === 'true' &&
        !candidate.params.has('localidad'),
    );
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('loads the farm dashboard', () => {
    service.getDashboard().subscribe();

    const request = httpMock.expectOne('/api/farms/dashboard');
    expect(request.request.method).toBe('GET');
    request.flush({
      totalFincasActivas: 0,
      totalLotesActivos: 0,
      totalCertificaciones: 0,
      fincas: [],
    });
  });

  it('creates a certification under its farm', () => {
    const payload = {
      tipoCertificacion: 'Fitosanitaria',
      entidadEmisora: 'Agrocalidad',
      numeroCertificado: 'CERT-01',
      fechaEmision: '2026-08-02',
    };
    service.createCertification('10', payload).subscribe();

    const request = httpMock.expectOne('/api/farms/10/certifications');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({});
  });

  it('uses soft deactivation endpoint for a farm', () => {
    service.deactivateFarm('10').subscribe();

    const request = httpMock.expectOne('/api/farms/10');
    expect(request.request.method).toBe('DELETE');
    request.flush({});
  });
});
