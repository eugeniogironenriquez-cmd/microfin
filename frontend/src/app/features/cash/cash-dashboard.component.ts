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

      <!-- Caja abierta -->
      @if (session()) {
        <mat-card class="session-card open">
          <mat-card-content>
            <div class="session-header">
              <div class="session-status">
                <mat-icon color="primary">lock_open</mat-icon>
                <div>
                  <strong>Caja abierta</strong>
                  <div class="text-muted">Desde {{ session()!.openedAt | date:'dd/MM/yyyy HH:mm' }}</div>
                </div>
              </div>
              <div class="session-amount">
                <span class="text-muted">Apertura</span>
                <strong>{{ session()!.openingBalance | currency:'MXN' }}</strong>
              </div>
            </div>

            <mat-divider class="my-16"></mat-divider>

            <h3>Cerrar caja</h3>
            <form [formGroup]="closeForm" (ngSubmit)="closeSession()" class="cash-form">
              <mat-form-field appearance="outline">
                <mat-label>Monto en caja al cierre *</mat-label>
                <input matInput type="number" step="0.01" formControlName="closingBalance">
                <span matPrefix>$&nbsp;</span>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Observaciones</mat-label>
                <textarea matInput formControlName="notes" rows="2"></textarea>
              </mat-form-field>
              <button mat-raised-button color="warn" type="submit"
                      [disabled]="closeForm.invalid || saving()">
                @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                @else { <mat-icon>lock</mat-icon> }
                Cerrar caja
              </button>
            </form>
          </mat-card-content>
        </mat-card>

      <!-- Caja cerrada -->
      } @else {
        <mat-card class="session-card closed">
          <mat-card-content>
            <div class="session-header">
              <div class="session-status">
                <mat-icon color="warn">lock</mat-icon>
                <div>
                  <strong>Caja cerrada</strong>
                  <div class="text-muted">Abre caja para registrar cobros</div>
                </div>
              </div>
            </div>

            <mat-divider class="my-16"></mat-divider>

            <h3>Abrir caja</h3>
            <form [formGroup]="openForm" (ngSubmit)="openSession()" class="cash-form">
              <mat-form-field appearance="outline">
                <mat-label>Fondo inicial *</mat-label>
                <input matInput type="number" step="0.01" formControlName="openingBalance">
                <span matPrefix>$&nbsp;</span>
                <mat-hint>Dinero con el que inicia la caja</mat-hint>
              </mat-form-field>
              <button mat-raised-button color="primary" type="submit"
                      [disabled]="openForm.invalid || saving()">
                @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                @else { <mat-icon>lock_open</mat-icon> }
                Abrir caja
              </button>
            </form>
          </mat-card-content>
        </mat-card>
      }
    }
  `
})
export class CashDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);
  session = signal<any>(null);
  loading = signal(true);
  saving = signal(false);

  openForm = this.fb.group({ openingBalance: [0, [Validators.required, Validators.min(0)]] });
  closeForm = this.fb.group({
    closingBalance: [null as number | null, [Validators.required, Validators.min(0)]],
    notes: [''],
  });

  ngOnInit() { this.loadStatus(); }

  loadStatus() {
    this.loading.set(true);
    this.api.get<any>('/cash/status').subscribe({
      next: (s) => { this.session.set(s); this.loading.set(false); },
      error: () => { this.session.set(null); this.loading.set(false); },
    });
  }

  openSession() {
    this.saving.set(true);
    this.api.post('/cash/open', { openingBalance: this.openForm.value.openingBalance }).subscribe({
      next: () => { this.snackbar.open('Caja abierta', 'OK', { duration: 3000 }); this.saving.set(false); this.loadStatus(); },
      error: (err) => { this.snackbar.open(err.error?.message?.[0] || 'Error', 'Cerrar', { duration: 5000 }); this.saving.set(false); },
    });
  }

  closeSession() {
    this.saving.set(true);
    this.api.post('/cash/close', this.closeForm.value).subscribe({
      next: () => { this.snackbar.open('Caja cerrada', 'OK', { duration: 3000 }); this.saving.set(false); this.loadStatus(); },
      error: (err) => { this.snackbar.open(err.error?.message?.[0] || 'Error', 'Cerrar', { duration: 5000 }); this.saving.set(false); },
    });
  }
}
