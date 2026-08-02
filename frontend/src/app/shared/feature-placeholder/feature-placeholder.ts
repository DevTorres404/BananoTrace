import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

@Component({
  selector: 'app-feature-placeholder',
  standalone: true,
  template: `
    <main class="placeholder">
      <section class="placeholder-card">
        <p>BananoTrace</p>
        <h1>{{ title() }}</h1>
        <span
          >La pantalla ya está registrada en la navegación y queda preparada para implementar su
          contenido.</span
        >
      </section>
    </main>
  `,
  styles: `
    .placeholder {
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 2rem;
      text-align: center;
    }
    .placeholder-card {
      width: min(700px, 100%);
      padding: clamp(2rem, 7vw, 4rem);
      border: 1px solid var(--color-border);
      border-radius: 24px;
      background: var(--color-surface);
      box-shadow: 0 22px 55px var(--color-shadow);
    }
    p {
      margin: 0;
      color: var(--color-primary);
      font-size: 0.78rem;
      font-weight: 850;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0.55rem 0;
      font-size: clamp(2rem, 6vw, 3.5rem);
    }
    span {
      display: inline-block;
      max-width: 620px;
      color: var(--color-text-secondary);
      line-height: 1.6;
    }
    @media (max-width: 900px) {
      .placeholder {
        min-height: calc(100vh - 64px);
        padding: 1rem;
      }
    }
  `,
})
export class FeaturePlaceholder {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly title = signal(this.resolveTitle(this.router.url));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.title.set(this.resolveTitle(event.urlAfterRedirects)));
  }

  private resolveTitle(url: string): string {
    const configuredTitle = this.route.snapshot.data['title'];
    if (typeof configuredTitle === 'string') return configuredTitle;

    const segment = url.split('?')[0].split('/').filter(Boolean).at(-1) ?? 'Dashboard';
    return segment
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
