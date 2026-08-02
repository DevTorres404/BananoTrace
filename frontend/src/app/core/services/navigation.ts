import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface NavigationItem {
  id: number;
  label: string;
  icon: string | null;
  route: string | null;
  children: NavigationItem[];
}

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly http = inject(HttpClient);

  getNavigation(): Observable<NavigationItem[]> {
    return this.http.get<NavigationItem[]>('/api/users/navigation');
  }
}
