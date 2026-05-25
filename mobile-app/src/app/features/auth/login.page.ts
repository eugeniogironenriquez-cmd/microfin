import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonItem, IonLabel, IonInput, IonButton,
  IonSpinner, IonIcon, IonNote } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { lockClosedOutline, mailOutline } from 'ionicons/icons';
import { MobileAuthService } from '../../core/auth/auth.service';

addIcons({ lockClosedOutline, mailOutline });

@Component({
  selector: 'app-mobile-login',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    IonContent, IonItem, IonLabel, IonInput, IonButton, IonSpinner, IonIcon, IonNote,
  ],
  template: `
    <ion-content class="login-content">
      <div class="login-container">
        <div class="logo-area">
          <div class="logo-circle">
            <ion-icon name="lock-closed-outline" size="large"></ion-icon>
          </div>
          <h1>MicroFin</h1>
          <p>Sistema de cobranza</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="login()" class="login-form">
          <ion-item class="form-field">
            <ion-icon name="mail-outline" slot="start"></ion-icon>
            <ion-label position="floating">Correo electrónico</ion-label>
            <ion-input type="email" formControlName="email" autocomplete="email"></ion-input>
          </ion-item>

          <ion-item class="form-field">
            <ion-icon name="lock-closed-outline" slot="start"></ion-icon>
            <ion-label position="floating">Contraseña</ion-label>
            <ion-input type="password" formControlName="password"></ion-input>
          </ion-item>

          @if (error()) {
            <ion-note color="danger" class="error-note">{{ error() }}</ion-note>
          }

          <ion-button type="submit" expand="block" class="login-btn"
                      [disabled]="form.invalid || loading()">
            @if (loading()) { <ion-spinner name="crescent" slot="start"></ion-spinner> }
            Iniciar sesión
          </ion-button>
        </form>
      </div>
    </ion-content>
  `,
  styles: [`
    .login-content { --background: linear-gradient(135deg, #1565c0, #0d47a1); }
    .login-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .logo-area { text-align: center; margin-bottom: 40px; color: white; }
    .logo-circle { width: 80px; height: 80px; border-radius: 20px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    .logo-circle ion-icon { font-size: 40px; color: white; }
    .logo-area h1 { font-size: 28px; font-weight: 700; margin: 0 0 4px; }
    .logo-area p { margin: 0; opacity: .8; }
    .login-form { width: 100%; max-width: 380px; background: white; border-radius: 16px; padding: 24px; box-shadow: 0 16px 48px rgba(0,0,0,.3); }
    .form-field { margin-bottom: 8px; }
    .login-btn { margin-top: 20px; height: 48px; }
    .error-note { display: block; padding: 8px 12px; margin-top: 8px; font-size: 13px; }
  `],
})
export class LoginMobilePage {
  private auth = inject(MobileAuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  loading = signal(false);
  error = signal('');

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  login() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.form.value.email!, this.form.value.password!).subscribe({
      next: () => { this.loading.set(false); this.router.navigate(['/collection']); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message?.[0] || 'Credenciales inválidas');
      },
    });
  }
}
