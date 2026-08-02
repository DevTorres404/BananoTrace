import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../services/auth';
import { NavigationItem, NavigationService } from '../../services/navigation';
import { ThemeService } from '../../services/theme';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnInit {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly navigationService = inject(NavigationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  items: NavigationItem[] = [];
  openGroups = new Set<number>();
  isMenuOpen = false;
  isLoading = true;
  currentUrl = this.router.url;

  ngOnInit(): void {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.currentUrl = this.normalizeRoute(event.urlAfterRedirects);
        this.openActiveGroups();
        this.cdr.detectChanges();
      });

    this.navigationService
      .getNavigation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items = items;
          this.isLoading = false;
          this.openActiveGroups();
          this.cdr.detectChanges();
        },
        error: () => {
          this.items = [];
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  toggleGroup(id: number): void {
    if (this.openGroups.has(id)) {
      this.openGroups.delete(id);
    } else {
      this.openGroups.add(id);
    }
  }

  isGroupOpen(id: number): boolean {
    return this.openGroups.has(id);
  }

  containsActiveRoute(item: NavigationItem): boolean {
    return (
      this.routeMatches(item.route) ||
      item.children.some((child) => this.containsActiveRoute(child))
    );
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  logout(): void {
    this.closeMenu();
    this.auth.logout();
  }

  trackById(_index: number, item: NavigationItem): number {
    return item.id;
  }

  private openActiveGroups(): void {
    const openParents = (items: NavigationItem[]): boolean => {
      let branchIsActive = false;

      for (const item of items) {
        const childIsActive = openParents(item.children);
        const itemIsActive = this.routeMatches(item.route) || childIsActive;
        if (childIsActive) this.openGroups.add(item.id);
        branchIsActive ||= itemIsActive;
      }

      return branchIsActive;
    };

    openParents(this.items);
  }

  private routeMatches(route: string | null): boolean {
    return route !== null && this.currentUrl === this.normalizeRoute(route);
  }

  private normalizeRoute(route: string): string {
    const normalized = route.split('?')[0].replace(/\/$/, '');
    return normalized || '/';
  }
}
