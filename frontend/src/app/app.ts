import { NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { Navbar } from './core/layout/navbar/navbar';
import { AuthService } from './core/services/auth';

@Component({
  selector: 'app-root',
  imports: [Navbar, NgIf, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly auth = inject(AuthService);
  private router = inject(Router);

  get hideNavbar(): boolean {
    const url = this.router.url;
    return url.startsWith('/login') || url.startsWith('/trace') || url.startsWith('/consulta');
  }
}
