import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
  });

  it('persists and applies the selected theme', () => {
    const service = TestBed.inject(ThemeService);

    service.setTheme('dark');

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('bananotrace-theme')).toBe('dark');
  });

  it('toggles between dark and light mode', () => {
    const service = TestBed.inject(ThemeService);
    service.setTheme('light');

    service.toggle();

    expect(service.theme()).toBe('dark');
  });
});
