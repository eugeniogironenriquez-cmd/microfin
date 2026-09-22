import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/index';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="auth-page">
      <mat-card class="auth-card">
        <div class="auth-header">
          <mat-icon class="header-icon">lock_reset</mat-icon>
          <h1>Recuperar contraseña</h1>
          <p>Ingresa tu correo y te enviaremos instrucciones para restablecer tu contraseña</p>
        </div>

        @if (sent()) {
          <div class="success-msg">
            <mat-icon>check_circle</mat-icon>
            <div>
              <strong>Revisa tu correo</strong>
              <p>Si el correo existe en el sistema, recibirás las instrucciones en unos minutos.</p>
            </div>
          </div>
          <a mat-stroked-button routerLink="/auth/login" class="w-full">
            <mat-icon>arrow_back</mat-icon> Volver al inicio de sesión
          </a>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Correo electrónico</mat-label>
              <input matInput type="email" formControlName="email">
              <mat-icon matPrefix>email</mat-icon>
            </mat-form-field>

            <button mat-raised-button color="primary" type="submit" class="w-full submit-btn"
                    [disabled]="form.invalid || loading()">
              @if (loading()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { <mat-icon>send</mat-icon> }
              Enviar instrucciones
            </button>

            <a mat-button routerLink="/auth/login" class="w-full back-link">
              <mat-icon>arrow_back</mat-icon> Volver al inicio de sesión
            </a>
          </form>
        }
      </mat-card>
    </div>
  `
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  loading = signal(false);
  sent = signal(false);

  form = this.fb.group({ email: ['', [Validators.required, Validators.email]] });

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.auth.forgotPassword(this.form.value.email!).subscribe({
      next: () => { this.loading.set(false); this.sent.set(true); },
      error: () => { this.loading.set(false); this.sent.set(true); }, // siempre mostrar éxito
    });
  }
}
