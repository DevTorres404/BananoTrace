import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';

describe('AuthInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should add Authorization header if token exists in localStorage', () => {
    localStorage.setItem('token', 'my-fake-token');

    httpClient.get('/test-endpoint').subscribe();

    const req = httpMock.expectOne('/test-endpoint');
    expect(req.request.headers.has('Authorization')).toBe(true);
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-fake-token');

    req.flush({});
  });

  it('should NOT add Authorization header if token does not exist', () => {
    httpClient.get('/test-endpoint').subscribe();

    const req = httpMock.expectOne('/test-endpoint');
    expect(req.request.headers.has('Authorization')).toBe(false);

    req.flush({});
  });

  it('refreshes the access token on a 401 and retries the original request once', () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('refreshToken', 'a-valid-refresh-token');

    let body: unknown;
    httpClient.get('/test-endpoint').subscribe((response) => {
      body = response;
    });

    const firstAttempt = httpMock.expectOne('/test-endpoint');
    expect(firstAttempt.request.headers.get('Authorization')).toBe('Bearer expired-token');
    firstAttempt.flush({ message: 'Token inválido' }, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne('/api/auth/refresh');
    refreshReq.flush({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      user: { id: '1', email: 'a@coil.com', nombres: 'A', apellidos: 'B', idRol: 1, rol: 'ADMINISTRADOR', idProductor: null },
    });

    const retriedAttempt = httpMock.expectOne('/test-endpoint');
    expect(retriedAttempt.request.headers.get('Authorization')).toBe('Bearer new-access-token');
    retriedAttempt.flush({ ok: true });

    expect(body).toEqual({ ok: true });
    expect(localStorage.getItem('token')).toBe('new-access-token');
  });

  it('propagates the original 401 when there is no refresh token to try', () => {
    localStorage.setItem('token', 'expired-token');

    let error: { status?: number } | undefined;
    httpClient.get('/test-endpoint').subscribe({ error: (err) => (error = err) });

    const req = httpMock.expectOne('/test-endpoint');
    req.flush({ message: 'Token inválido' }, { status: 401, statusText: 'Unauthorized' });

    expect(error?.status).toBe(401);
  });

  it('does not attempt a refresh for a 401 coming from the login endpoint itself', () => {
    let error: { status?: number } | undefined;
    httpClient
      .post('/api/auth/login', { email: 'a@coil.com', password: 'wrong' })
      .subscribe({ error: (err) => (error = err) });

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ message: 'Credenciales inválidas' }, { status: 401, statusText: 'Unauthorized' });

    expect(error?.status).toBe(401);
  });
});
