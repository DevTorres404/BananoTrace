import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  loginForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.login(this.loginForm.value).subscribe({
      next: (response) => {
        this.isLoading = false;

        if (response.user.idRol === 1 || response.user.rol.toUpperCase() === 'ADMINISTRADOR') {
          this.router.navigate(['/usuarios']).then((success) => {
            if (!success) {
              this.errorMessage = 'Redirección falló. El sistema denegó el acceso.';
              this.cdr.detectChanges();
            }
          });
        } else {
          void this.router.navigate(['/dashboard']);
        }
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'Credenciales inválidas';
        this.cdr.detectChanges();
      },
    });
  }
}
