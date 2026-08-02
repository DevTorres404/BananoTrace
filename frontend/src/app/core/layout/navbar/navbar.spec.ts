import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth';
import { NavigationItem, NavigationService } from '../../services/navigation';
import { Navbar } from './navbar';

describe('Navbar', () => {
  let component: Navbar;
  let fixture: ComponentFixture<Navbar>;

  const navigation: NavigationItem[] = [
    {
      id: 1,
      label: 'Producción',
      icon: null,
      route: null,
      children: [
        { id: 2, label: 'Lotes', icon: null, route: '/lotes', children: [] },
        { id: 3, label: 'Cosechas', icon: null, route: '/cosechas', children: [] },
      ],
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Navbar],
      providers: [
        provideRouter([]),
        { provide: NavigationService, useValue: { getNavigation: () => of(navigation) } },
        {
          provide: AuthService,
          useValue: {
            currentUser: signal({ email: 'admin@bananotrace.ec', rol: 'ADMINISTRADOR' }),
            logout: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Navbar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('opens and closes submenus through explicit click state', () => {
    component.toggleGroup(1);
    expect(component.isGroupOpen(1)).toBe(true);

    component.toggleGroup(1);
    expect(component.isGroupOpen(1)).toBe(false);
  });

  it('keeps a submenu available while changing between sibling routes', () => {
    component.toggleGroup(1);
    component.currentUrl = '/lotes';
    expect(component.containsActiveRoute(navigation[0])).toBe(true);

    component.currentUrl = '/cosechas';
    expect(component.isGroupOpen(1)).toBe(true);
    expect(component.containsActiveRoute(navigation[0])).toBe(true);
  });
});
