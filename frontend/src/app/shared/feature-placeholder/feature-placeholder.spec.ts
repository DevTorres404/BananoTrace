import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { FeaturePlaceholder } from './feature-placeholder';

describe('FeaturePlaceholder', () => {
  let fixture: ComponentFixture<FeaturePlaceholder>;
  const events = new Subject<NavigationEnd>();
  const router = { url: '/produccion/lotes', events };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturePlaceholder],
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturePlaceholder);
    fixture.detectChanges();
  });

  it('updates its content when Angular reuses the wildcard route component', () => {
    expect(fixture.componentInstance.title()).toBe('Lotes');

    events.next(new NavigationEnd(2, '/produccion/cosechas', '/produccion/cosechas'));

    expect(fixture.componentInstance.title()).toBe('Cosechas');
  });
});
