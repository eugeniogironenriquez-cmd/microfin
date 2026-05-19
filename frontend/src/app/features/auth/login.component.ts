import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/index';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="login-root">

      <!-- IZQUIERDA: formulario -->
      <div class="login-left">
        <div class="login-form-wrap">

          <div class="login-brand">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                stroke="#1C4532" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="9 22 9 12 15 12 15 22"
                stroke="#1C4532" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="brand-name">Microcapital-Ixtepec</span>
          </div>

          <h1 class="login-title">Iniciar sesión</h1>
          <p class="login-desc">Ingresa tus credenciales para acceder al sistema</p>

          @if (error()) {
            <div class="login-error">{{ error() }}</div>
          }

          <form [formGroup]="form" (ngSubmit)="submit()">

            <div class="field">
              <label class="field-label">Correo electrónico</label>
              <input class="field-input" type="email" formControlName="email"
                     placeholder="ejemplo@microcapital.com" autocomplete="email">
            </div>

            <div class="field">
              <label class="field-label">Contraseña</label>
              <div class="field-pass">
                <input class="field-input pass-input"
                       [type]="showPass() ? 'text' : 'password'"
                       formControlName="password"
                       placeholder="••••••••"
                       autocomplete="current-password">
                <button type="button" class="eye-btn" (click)="showPass.set(!showPass())">
                  @if (showPass()) {
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="#718096" stroke-width="1.8" stroke-linecap="round"/>
                      <line x1="1" y1="1" x2="23" y2="23" stroke="#718096" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  } @else {
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#718096" stroke-width="1.8" stroke-linecap="round"/>
                      <circle cx="12" cy="12" r="3" stroke="#718096" stroke-width="1.8"/>
                    </svg>
                  }
                </button>
              </div>
            </div>

            <button class="btn-signin" type="submit" [disabled]="loading()">
              @if (loading()) { <span class="spin"></span> }
              @else { Iniciar sesión }
            </button>

          </form>
        </div>
      </div>

      <!-- DERECHA: panel decorativo -->
      <div class="login-right">
        <div class="right-inner">

          <div class="right-top">
            <div class="right-support">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
                  stroke="rgba(255,255,255,.8)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Soporte
            </div>
          </div>

          <div class="right-card">
            <div class="promo-card">
              <div class="promo-text">
                <h2 class="promo-title">Gestión financiera<br>inteligente</h2>
                <p class="promo-desc">Administra tu cartera de microcréditos con total visibilidad y control.</p>
                <div class="promo-btn">Conoce más</div>
              </div>
              <div class="promo-deco">
                <div class="deco-card">
                  <div class="deco-logo">MC</div>
                  <div class="deco-num">•••• •••• •••• 4532</div>
                  <div class="deco-exp">05/28</div>
                </div>
              </div>
            </div>

            <div class="stats-mini">
              <div class="stats-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <line x1="18" y1="20" x2="18" y2="10" stroke="white" stroke-width="2" stroke-linecap="round"/>
                  <line x1="12" y1="20" x2="12" y2="4"  stroke="white" stroke-width="2" stroke-linecap="round"/>
                  <line x1="6"  y1="20" x2="6"  y2="14" stroke="white" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
              <div>
                <div class="stats-label">Cartera activa</div>
                <div class="stats-value">En tiempo real</div>
              </div>
            </div>
          </div>

          <div class="right-bottom">
            <h3 class="right-slogan">Microcapital-Ixtepec</h3>
            <p class="right-slogan-sub">Sistema de gestión de microfinanzas. Control total de tu operación.</p>
            <div class="right-dots">
              <span class="dot active"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>

        </div>
      </div>

    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; }

    .login-root {
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    @media (max-width: 768px) {
      .login-root { grid-template-columns: 1fr; }
      .login-right { display: none; }
    }

    /* ── IZQUIERDA ─────────────────────── */
    .login-left {
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 40px;
    }

    .login-form-wrap { width: 100%; max-width: 420px; }

    .login-brand {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 48px;
    }
    .brand-name {
      font-size: 18px; font-weight: 700;
      color: #171923; letter-spacing: -0.28px;
    }

    .login-title {
      font-size: 40px; font-weight: 800;
      color: #171923; letter-spacing: -0.68px;
      margin: 0 0 8px;
    }
    .login-desc {
      font-size: 15px; color: #718096;
      margin: 0 0 32px; font-weight: 400;
    }

    .login-error {
      background: #FEF2F2; color: #DC2626;
      border: 1px solid #FECACA;
      border-radius: 10px; padding: 12px 14px;
      font-size: 14px; margin-bottom: 20px;
    }

    .field { margin-bottom: 20px; }
    .field-label {
      display: block; font-size: 14px; font-weight: 500;
      color: #4A5568; margin-bottom: 8px; letter-spacing: -0.28px;
    }
    .field-input {
      width: 100%; height: 48px; padding: 0 16px;
      border: 1.5px solid #CBD5E0; border-radius: 12px;
      font-family: 'Inter', sans-serif; font-size: 15px;
      color: #4A5568; outline: none;
      transition: border-color .2s;
      background: #fff;
    }
    .field-input:focus { border-color: #1C4532; }
    .field-input::placeholder { color: #A0AEC0; }

    .field-pass { position: relative; }
    .field-pass .pass-input { padding-right: 48px; }
    .eye-btn {
      position: absolute; right: 14px; top: 50%;
      transform: translateY(-50%);
      background: none; border: none; cursor: pointer;
      display: flex; align-items: center;
    }

    .btn-signin {
      width: 100%; height: 52px; margin-top: 8px;
      background: #1C4532; color: #fff;
      border: none; border-radius: 70px;
      font-family: 'Inter', sans-serif;
      font-size: 16px; font-weight: 600;
      cursor: pointer; letter-spacing: -0.154px;
      display: flex; align-items: center; justify-content: center;
      transition: background .2s, transform .15s, box-shadow .2s;
      box-shadow: 0 4px 16px rgba(28,69,50,.35);
    }
    .btn-signin:hover:not([disabled]) {
      background: #245c3e;
      transform: translateY(-1px);
      box-shadow: 0 8px 24px rgba(28,69,50,.4);
    }
    .btn-signin[disabled] { opacity: .6; cursor: not-allowed; }

    .spin {
      width: 20px; height: 20px;
      border: 2px solid rgba(255,255,255,.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── DERECHA ───────────────────────── */
    .login-right {
      background: linear-gradient(160deg, #1C4532 0%, #0d2b1e 100%);
      display: flex; align-items: center; justify-content: center;
      padding: 48px 40px;
      position: relative; overflow: hidden;
    }

    .login-right::before {
      content: '';
      position: absolute; top: -80px; right: -80px;
      width: 320px; height: 320px; border-radius: 50%;
      background: rgba(255,255,255,.04);
    }

    .right-inner {
      width: 100%; max-width: 440px;
      display: flex; flex-direction: column; gap: 32px;
      position: relative; z-index: 1;
    }

    .right-top { display: flex; justify-content: flex-end; }
    .right-support {
      display: flex; align-items: center; gap: 8px;
      color: rgba(255,255,255,.8); font-size: 14px; font-weight: 500;
      background: rgba(255,255,255,.1); border-radius: 20px;
      padding: 8px 16px;
    }

    /* Promo card */
    .promo-card {
      background: #fff; border-radius: 20px;
      padding: 28px 24px;
      display: flex; align-items: flex-start; gap: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,.2);
    }
    .promo-text { flex: 1; }
    .promo-title {
      font-size: 22px; font-weight: 800;
      color: #171923; letter-spacing: -0.48px;
      margin: 0 0 10px; line-height: 1.2;
    }
    .promo-desc {
      font-size: 13px; color: #718096;
      margin: 0 0 20px; line-height: 1.6;
    }
    .promo-btn {
      display: inline-block;
      background: #1C4532; color: #fff;
      border-radius: 20px; padding: 10px 20px;
      font-size: 13px; font-weight: 600; cursor: pointer;
    }

    .promo-deco { flex-shrink: 0; }
    .deco-card {
      width: 120px; height: 76px;
      background: linear-gradient(135deg, #2d6a4f, #1C4532);
      border-radius: 10px; padding: 12px;
      display: flex; flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 8px 24px rgba(0,0,0,.2);
      transform: rotate(8deg);
    }
    .deco-logo { font-size: 11px; font-weight: 800; color: rgba(255,255,255,.9); letter-spacing: .5px; }
    .deco-num  { font-size: 8px;  color: rgba(255,255,255,.7); letter-spacing: .5px; }
    .deco-exp  { font-size: 8px;  color: rgba(255,255,255,.6); }

    /* Stats mini */
    .stats-mini {
      background: rgba(255,255,255,.1);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,.15);
      border-radius: 16px; padding: 16px 20px;
      display: flex; align-items: center; gap: 14px;
    }
    .stats-icon {
      width: 40px; height: 40px;
      background: rgba(255,255,255,.15);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .stats-label { font-size: 12px; color: rgba(255,255,255,.6); margin-bottom: 2px; }
    .stats-value { font-size: 16px; font-weight: 700; color: #fff; }

    /* Bottom */
    .right-bottom { text-align: center; }
    .right-slogan {
      font-size: 24px; font-weight: 700;
      color: #fff; letter-spacing: -0.48px; margin: 0 0 8px;
    }
    .right-slogan-sub {
      font-size: 14px; color: rgba(255,255,255,.6);
      margin: 0 0 20px; line-height: 1.6;
    }
    .right-dots { display: flex; justify-content: center; gap: 6px; }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: rgba(255,255,255,.3);
    }
    .dot.active { background: #fff; width: 24px; border-radius: 4px; }
  `],
})
export class LoginComponent {
  private fb     = inject(FormBuilder);
  private auth   = inject(AuthService);
  private router = inject(Router);

  loading  = signal(false);
  error    = signal('');
  showPass = signal(false);

  form = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.value;
    this.auth.login(email!, password!).subscribe({
      next:  () => this.router.navigate(['/dashboard']),
      error: () => { this.error.set('Correo o contraseña incorrectos'); this.loading.set(false); },
    });
  }
}