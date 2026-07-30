import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/index';
import { PdfDownloadService } from '../../core/pdf-download.service';

@Component({
  selector: 'app-loan-simulator',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatTableModule, MatIconModule, MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>calculate</mat-icon> Simulador de crédito</h1>
    </div>

    <div class="simulator-layout">
      <mat-card>
        <mat-card-header><mat-card-title>Parámetros</mat-card-title></mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="simulate()" class="sim-form">

            <!-- Monto -->
            <mat-form-field appearance="outline">
              <mat-label>Monto del préstamo *</mat-label>
              <input matInput type="number" formControlName="principalAmount">
              <span matPrefix>$&nbsp;</span>
            </mat-form-field>

            <!-- Plazo en días (carga porcentaje configurado) -->
            <mat-form-field appearance="outline">
              <mat-label>Plazo (días) *</mat-label>
              <mat-select formControlName="days" (selectionChange)="onPlazoChange()">
                @for (p of plazos(); track p.id) {
                  <mat-option [value]="p.days">
                    {{ p.days }} días — {{ (p.percentage * 100).toFixed(0) }}%
                  </mat-option>
                }
              </mat-select>
              @if (selectedPlazo()) {
                <mat-hint>Tasa aplicada: {{ (selectedPlazo()!.percentage * 100).toFixed(0) }}%</mat-hint>
              }
            </mat-form-field>

            <button mat-raised-button color="primary" type="submit"
                    [disabled]="form.invalid || loading()">
              @if (loading()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { <mat-icon>calculate</mat-icon> }
              Calcular
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      @if (result()) {
        <div class="sim-results">
          <mat-card>
            <mat-card-content>
              <!-- Cuota ajustable -->
              <div class="cuota-ajuste">
                <div class="cuota-label">
                  <span class="label">Cuota diaria</span>
                  <span class="min-hint">Mínimo: {{ minPayment() | currency:'MXN' }}</span>
                </div>
                <mat-form-field appearance="outline" class="cuota-field">
                  <input matInput type="number" [value]="cuotaActual()"
                         (input)="onCuotaInput($event)" step="1">
                  <span matPrefix>$&nbsp;</span>
                </mat-form-field>
                <button mat-stroked-button color="primary" (click)="recalcConCuota()"
                        [disabled]="loading()">
                  <mat-icon>refresh</mat-icon> Aplicar cuota
                </button>
              </div>

              <div class="summary-grid">
                <div class="summary-item">
                  <span class="label">Cuota diaria</span>
                  <span class="value-num value-primary">{{ result()!.periodicPayment | currency:'MXN' }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Total a pagar</span>
                  <span class="value-num">{{ result()!.totalPayment | currency:'MXN' }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Días de pago</span>
                  <span class="value-num">{{ result()!.schedule.length }}</span>
                </div>
              </div>
            </mat-card-content>
          </mat-card>

          <mat-card>
            <mat-card-header><mat-card-title>Tabla de pagos (Lun-Vie)</mat-card-title></mat-card-header>
            <mat-card-content>
              <table mat-table [dataSource]="result()!.schedule" style="width:100%">
                <ng-container matColumnDef="period">
                  <th mat-header-cell *matHeaderCellDef>#</th>
                  <td mat-cell *matCellDef="let r">{{ r.period }}</td>
                </ng-container>
                <ng-container matColumnDef="dueDate">
                  <th mat-header-cell *matHeaderCellDef>Fecha de pago</th>
                  <td mat-cell *matCellDef="let r">{{ r.dueDate | date:'EEE dd/MM/yyyy':'UTC' }}</td>
                </ng-container>
                <ng-container matColumnDef="payment">
                  <th mat-header-cell *matHeaderCellDef>Monto</th>
                  <td mat-cell *matCellDef="let r"><strong>{{ r.payment | currency:'MXN' }}</strong></td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="cols"></tr>
                <tr mat-row *matRowDef="let row; columns: cols;"></tr>
              </table>
            </mat-card-content>
          </mat-card>

          <div style="display:flex;justify-content:flex-end">
            <button mat-raised-button color="primary" (click)="downloadPdf()" [disabled]="downloading()">
              @if (downloading()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { <mat-icon>picture_as_pdf</mat-icon> }
              Descargar plan de pagos
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cuota-ajuste {
      display:flex; align-items:center; gap:12px; flex-wrap:wrap;
      background:#F7FAFC; border-radius:10px; padding:12px 14px; margin-bottom:14px;
    }
    .cuota-label { display:flex; flex-direction:column; }
    .cuota-label .label { font-size:13px; font-weight:600; }
    .min-hint { font-size:11px; color:#718096; }
    .cuota-field { width:140px; margin-bottom:-1.25em; }
  `],
})
export class LoanSimulatorComponent implements OnInit {
  private api    = inject(ApiService);
  private fb     = inject(FormBuilder);
  private pdfSvc = inject(PdfDownloadService);
  private snackbar = inject(MatSnackBar);

  loading      = signal(false);
  downloading  = signal(false);
  result       = signal<any>(null);
  plazos       = signal<any[]>([]);
  selectedPlazo = signal<any>(null);
  minPayment   = signal<number>(0);
  cuotaActual  = signal<number>(0);

  cols = ['period', 'dueDate', 'payment'];

  form = this.fb.group({
    principalAmount: [null as number | null, [Validators.required, Validators.min(1)]],
    days:            [null as number | null, [Validators.required, Validators.min(1)]],
  });

  ngOnInit() {
    this.api.get<any>('/plazos-credito').subscribe({
      next: (r) => {
        const list = Array.isArray(r) ? r : r?.data ?? [];
        this.plazos.set(list);
      },
    });
  }

  onPlazoChange() {
    const p = this.plazos().find(x => x.days === this.form.value.days);
    this.selectedPlazo.set(p || null);
    this.result.set(null);
  }

  simulate() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.api.post<any>('/loans/simulate', {
      principalAmount: this.form.value.principalAmount,
      days:            this.form.value.days,
    }).subscribe({
      next: (r) => {
        this.result.set(r);
        this.minPayment.set(r.minPayment ?? r.periodicPayment);
        this.cuotaActual.set(r.periodicPayment);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onCuotaInput(event: Event) {
    this.cuotaActual.set(Number((event.target as HTMLInputElement).value));
  }

  // Recalcula con la cuota ajustada (no menor al mínimo)
  recalcConCuota() {
    const cuota = Number(this.cuotaActual());
    if (cuota < this.minPayment()) {
      this.snackbar.open(`La cuota no puede ser menor a ${this.minPayment()}`, 'Cerrar', { duration: 4000 });
      return;
    }
    this.loading.set(true);
    this.api.post<any>('/loans/simulate', {
      principalAmount: this.form.value.principalAmount,
      days:            this.form.value.days,
      customPayment:   cuota,
    }).subscribe({
      next: (r) => {
        this.result.set(r);
        this.minPayment.set(r.minPayment ?? r.periodicPayment);
        this.loading.set(false);
      },
      error: (err) => {
        this.snackbar.open(err.error?.message || 'Error al recalcular', 'Cerrar', { duration: 4000 });
        this.loading.set(false);
      },
    });
  }

  downloadPdf() {
    if (!this.result()) return;
    this.downloading.set(true);
    const cuota = Number(this.cuotaActual());
    this.pdfSvc.downloadPost('/loans/simulate/pdf', 'plan-pagos-simulacion.pdf', {
      principalAmount: this.form.value.principalAmount,
      days:            this.form.value.days,
      customPayment:   cuota > this.minPayment() ? cuota : undefined,
    });
    setTimeout(() => this.downloading.set(false), 2000);
  }
}