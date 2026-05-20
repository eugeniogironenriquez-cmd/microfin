import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService, AuthService } from '../../core/index';

@Component({
  selector: 'app-cash-dashboard',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, MatSnackBarModule, MatDividerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>point_of_sale</mat-icon> Caja</h1>
    </div>

    @if (loading()) {
      <div class="loading-overlay"><mat-spinner></mat-spinner></div>
    } @else {

      <!-- ── CAJA ABIERTA ──────────────────────────── -->
      @if (session()) {
        <div class="cash-layout">

          <!-- Tarjeta de estado -->
          <div class="status-card open-card">
            <div class="status-icon-wrap open-icon">
              <mat-icon>lock_open</mat-icon>
            </div>
            <div class="status-info">
              <div class="status-badge open-badge">● EN OPERACIÓN</div>
              <h2 class="status-title">Caja abierta</h2>
              <div class="status-sub">
                Apertura: {{ session()!.openedAt | date:'dd/MM/yyyy' }} a las {{ session()!.openedAt | date:'HH:mm' }}
              </div>
            </div>
            <div class="status-amount">
              <span class="amount-label">Fondo inicial</span>
              <span class="amount-value">{{ session()!.openingBalance | currency:'MXN' }}</span>
            </div>
          </div>

          <!-- Formulario de cierre -->
          <mat-card class="action-card">
            <mat-card-content>
              <div class="action-header">
                <mat-icon class="action-icon warn-icon">lock</mat-icon>
                <div>
                  <h3 class="action-title">Cerrar caja</h3>
                  <p class="action-sub">Ingresa el efectivo contado al finalizar la jornada</p>
                </div>
              </div>
              <mat-divider style="margin:16px 0"></mat-divider>
              <form [formGroup]="closeForm" (ngSubmit)="closeSession()" class="cash-form">
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Monto en caja al cierre *</mat-label>
                  <input matInput type="number" step="0.01" formControlName="closingBalance">
                  <span matPrefix>$&nbsp;</span>
                  <mat-icon matSuffix>payments</mat-icon>
                </mat-form-field>
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Observaciones del cierre</mat-label>
                  <textarea matInput formControlName="notes" rows="2"
                            placeholder="Diferencias, notas del día..."></textarea>
                </mat-form-field>
                <button mat-raised-button color="warn" type="submit" class="action-btn"
                        [disabled]="closeForm.invalid || saving()">
                  @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                  @else { <mat-icon>lock</mat-icon> }
                  Cerrar caja
                </button>
              </form>
            </mat-card-content>
          </mat-card>

        </div>

      <!-- ── CAJA CERRADA ──────────────────────────── -->
      } @else {
        <div class="cash-layout">

          <!-- Tarjeta de estado -->
          <div class="status-card closed-card">
            <div class="status-icon-wrap closed-icon">
              <mat-icon>lock</mat-icon>
            </div>
            <div class="status-info">
              <div class="status-badge closed-badge">● CERRADA</div>
              <h2 class="status-title">Caja cerrada</h2>
              <div class="status-sub">Abre caja para iniciar operaciones del día</div>
            </div>
          </div>

          <!-- Formulario de apertura -->
          <mat-card class="action-card">
            <mat-card-content>
              <div class="action-header">
                <mat-icon class="action-icon open-icon">lock_open</mat-icon>
                <div>
                  <h3 class="action-title">Abrir caja</h3>
                  <p class="action-sub">Ingresa el fondo con el que inicias la jornada</p>
                </div>
              </div>
              <mat-divider style="margin:16px 0"></mat-divider>
              <form [formGroup]="openForm" (ngSubmit)="openSession()" class="cash-form">
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Fondo inicial *</mat-label>
                  <input matInput type="number" step="0.01" formControlName="openingBalance">
                  <span matPrefix>$&nbsp;</span>
                  <mat-icon matSuffix>account_balance_wallet</mat-icon>
                  <mat-hint>Efectivo disponible al inicio del día</mat-hint>
                </mat-form-field>
                <button mat-raised-button color="primary" type="submit" class="action-btn"
                        [disabled]="openForm.invalid || saving()">
                  @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                  @else { <mat-icon>lock_open</mat-icon> }
                  Abrir caja
                </button>
              </form>
            </mat-card-content>
          </mat-card>

        </div>
      }
    }
  `,
  styles: [`
    .cash-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      align-items: start;
      max-width: 900px;
    }
    @media(max-width:700px){ .cash-layout { grid-template-columns: 1fr; } }

    /* ── STATUS CARD ── */
    .status-card {
      border-radius: 20px;
      padding: 28px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 220px;
      box-shadow: 0 8px 32px rgba(0,0,0,.12);
    }
    .open-card {
      background: linear-gradient(135deg, #1C4532 0%, #276749 100%);
    }
    .closed-card {
      background: linear-gradient(135deg, #2D3748 0%, #4A5568 100%);
    }

    .status-icon-wrap {
      width: 56px; height: 56px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
    }
    .open-icon  { background: rgba(255,255,255,.15); }
    .closed-icon { background: rgba(255,255,255,.12); }
    .status-icon-wrap mat-icon { color: #fff !important; font-size: 28px; width: 28px; height: 28px; }

    .status-badge {
      font-size: 11px; font-weight: 700; letter-spacing: 1px;
      color: rgba(255,255,255,.7); margin-bottom: 4px;
    }
    .open-badge   { color: #86efac; }
    .closed-badge { color: rgba(255,255,255,.5); }

    .status-title { margin: 0; font-size: 22px; font-weight: 700; color: #fff; }
    .status-sub   { font-size: 13px; color: rgba(255,255,255,.65); margin-top: 4px; }

    .status-amount {
      margin-top: auto;
      padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,.15);
      display: flex; flex-direction: column; gap: 2px;
    }
    .amount-label { font-size: 11px; color: rgba(255,255,255,.6); text-transform: uppercase; letter-spacing: .5px; }
    .amount-value { font-size: 28px; font-weight: 700; color: #fff; }

    /* ── ACTION CARD ── */
    .action-card { border-radius: 16px !important; box-shadow: 0 4px 20px rgba(0,0,0,.08) !important; }

    .action-header {
      display: flex; align-items: flex-start; gap: 14px;
    }
    .action-icon {
      font-size: 36px !important; width: 36px !important; height: 36px !important;
      margin-top: 2px; flex-shrink: 0;
    }
    .action-icon.open-icon  { color: #1C4532 !important; }
    .action-icon.warn-icon  { color: #DC2626 !important; }

    .action-title { margin: 0; font-size: 18px; font-weight: 700; color: #171923; }
    .action-sub   { margin: 4px 0 0; font-size: 13px; color: #718096; }

    .cash-form { display: flex; flex-direction: column; gap: 14px; }
    .w-full    { width: 100%; }

    .action-btn {
      height: 48px !important;
      font-size: 15px !important;
      font-weight: 600 !important;
      border-radius: 10px !important;
      letter-spacing: .3px;
    }
  `],
})
export class CashDashboardComponent implements OnInit {
  private api     = inject(ApiService);
  private fb      = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  session = signal<any>(null);
  loading = signal(true);
  saving  = signal(false);

  openForm = this.fb.group({
    openingBalance: [0, [Validators.required, Validators.min(0)]],
  });

  closeForm = this.fb.group({
    closingBalance: [null as number | null, [Validators.required, Validators.min(0)]],
    notes:          [''],
  });

  ngOnInit() { this.loadStatus(); }

  loadStatus() {
    this.loading.set(true);
    this.api.get<any>('/cash/status').subscribe({
      next: (s) => { this.session.set(s || null); this.loading.set(false); },
      error: () => { this.session.set(null); this.loading.set(false); },
    });
  }

  openSession() {
    this.saving.set(true);
    this.api.post('/cash/open', { openingBalance: this.openForm.value.openingBalance }).subscribe({
      next: () => {
        this.snackbar.open('¡Caja abierta correctamente!', 'OK', { duration: 3000 });
        this.saving.set(false); this.loadStatus();
      },
      error: (err) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error al abrir caja', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  closeSession() {
    this.saving.set(true);
    this.api.post('/cash/close', this.closeForm.value).subscribe({
      next: () => {
        this.snackbar.open('Caja cerrada correctamente', 'OK', { duration: 3000 });
        this.saving.set(false); this.loadStatus();
        this.closeForm.reset();
      },
      error: (err) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error al cerrar caja', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }
}