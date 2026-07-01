import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand">
          <div class="brand-mark">
            <mat-icon>support_agent</mat-icon>
          </div>
          <h1>Portal de Gestión</h1>
          <p>Cobranza · Microcapital Ixtepec</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Correo</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="username">
            <mat-icon matPrefix>mail_outline</mat-icon>
            <mat-error>Ingresa un correo válido</mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full">
            <mat-label>Contraseña</mat-label>
            <input matInput [type]="hide() ? 'password' : 'text'" formControlName="password"
                   autocomplete="current-password">
            <mat-icon matPrefix>lock_outline</mat-icon>
            <button mat-icon-button matSuffix type="button" (click)="hide.set(!hide())">
              <mat-icon>{{ hide() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            <mat-error>La contraseña es obligatoria</mat-error>
          </mat-form-field>

          <button mat-raised-button color="primary" type="submit" class="full submit"
                  [disabled]="loading()">
            @if (loading()) {
              <mat-spinner diameter="22"></mat-spinner>
            } @else {
              Entrar
            }
          </button>
        </form>
      </div>
      <p class="foot">{{ appName }}</p>
    </div>
  `,
  styles: [`
    .login-wrap {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      padding: 24px;
      background:
        radial-gradient(1200px 500px at 50% -10%, #155777 0%, transparent 60%),
        linear-gradient(160deg, #0d3a52 0%, #123f57 55%, #0a2f43 100%);
    }
    .login-card {
      width: 100%;
      max-width: 380px;
      background: #fff;
      border-radius: 16px;
      padding: 32px 28px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.35);
    }
    .brand { text-align: center; margin-bottom: 22px; }
    .brand-mark {
      width: 60px; height: 60px; border-radius: 16px;
      background: linear-gradient(140deg, #2595ca, #155777);
      display: inline-flex; align-items: center; justify-content: center;
      margin-bottom: 12px;
    }
    .brand-mark mat-icon {
      color: #fff; font-size: 32px; width: 32px; height: 32px;
    }
    .brand h1 { margin: 0; font-size: 20px; color: #0d3a52; font-weight: 700; }
    .brand p { margin: 4px 0 0; font-size: 13px; color: #718096; }
    .full { width: 100%; }
    .submit { height: 46px; margin-top: 6px; font-weight: 600; }
    .submit mat-spinner { margin: 0 auto; }
    .foot { color: rgba(255,255,255,0.6); font-size: 12px; margin: 0; }
  `],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  hide = signal(true);
  loading = signal(false);
  appName = environment.appName;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const { email, password } = this.form.value;
    this.auth.login(email!, password!).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/monitor']);
      },
      error: (err) => {
        this.loading.set(false);
        this.snack.open(
          err?.error?.message || 'Correo o contraseña incorrectos',
          'Cerrar',
          { duration: 4000 },
        );
      },
    });
  }
}
