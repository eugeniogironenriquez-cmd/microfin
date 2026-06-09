import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent, IonInput, IonButton, IonItem, IonLabel, IonSpinner,
  IonText, IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { lockClosedOutline, personOutline } from 'ionicons/icons';

import { AuthService } from '../../core/auth.service';
import { NetworkService } from '../../core/network.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonContent, IonInput, IonButton, IonItem, IonLabel, IonSpinner, IonText, IonIcon,
  ],
  template: `
    <ion-content class="login-bg">
      <div class="login-wrap">
        <div class="brand">
          <div class="logo-circle"><ion-icon name="lock-closed-outline"></ion-icon></div>
          <h1>Microcapital</h1>
          <p>Cobranza móvil — Ixtepec</p>
        </div>

        <div class="card">
          @if (!network.online()) {
            <ion-text color="warning">
              <p class="hint">Sin conexión. Necesitas internet para iniciar sesión la primera vez.</p>
            </ion-text>
          }

          <ion-item>
            <ion-icon name="person-outline" slot="start"></ion-icon>
            <ion-label position="stacked">Correo</ion-label>
            <ion-input type="email" [(ngModel)]="email" autocomplete="email"
                       placeholder="correo@microfin.com"></ion-input>
          </ion-item>

          <ion-item>
            <ion-icon name="lock-closed-outline" slot="start"></ion-icon>
            <ion-label position="stacked">Contraseña</ion-label>
            <ion-input type="password" [(ngModel)]="password"
                       (keyup.enter)="login()"></ion-input>
          </ion-item>

          @if (error()) {
            <ion-text color="danger"><p class="hint">{{ error() }}</p></ion-text>
          }

          <ion-button expand="block" (click)="login()" [disabled]="loading()">
            @if (loading()) { <ion-spinner name="crescent"></ion-spinner> }
            @else { Iniciar sesión }
          </ion-button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .login-bg { --background: linear-gradient(160deg, #1C4532 0%, #2C3E6B 100%); }
    .login-wrap { display:flex; flex-direction:column; justify-content:center; min-height:100%; padding:24px; }
    .brand { text-align:center; color:#fff; margin-bottom:28px; }
    .logo-circle {
      width:72px; height:72px; border-radius:50%; background:rgba(255,255,255,.15);
      display:flex; align-items:center; justify-content:center; margin:0 auto 14px;
    }
    .logo-circle ion-icon { font-size:34px; color:#fff; }
    .brand h1 { margin:0; font-size:26px; font-weight:700; }
    .brand p  { margin:4px 0 0; opacity:.8; font-size:14px; }
    .card { background:#fff; border-radius:16px; padding:18px; box-shadow:0 12px 40px rgba(0,0,0,.25); }
    .card ion-item { --background:transparent; margin-bottom:8px; }
    .card ion-button { margin-top:16px; }
    .hint { font-size:13px; margin:8px 4px; }
  `],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly network = inject(NetworkService);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  constructor() {
    addIcons({ lockClosedOutline, personOutline });
  }

  async login() {
    if (!this.email || !this.password) {
      this.error.set('Ingresa correo y contraseña');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.login(this.email.trim(), this.password);
      this.router.navigate(['/clients'], { replaceUrl: true });
    } catch (e: any) {
      this.error.set(e?.error?.message || 'Credenciales incorrectas o sin conexión');
    } finally {
      this.loading.set(false);
    }
  }
}
