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
import { ApiService } from '../../core/index';
import { PdfDownloadService } from '../../core/pdf-download.service';

@Component({
  selector: 'app-loan-simulator',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatTableModule, MatIconModule, MatProgressSpinnerModule,
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
                  <span class="label">Intereses totales</span>
                  <span class="value-num value-warn">{{ result()!.totalInterest | currency:'MXN' }}</span>
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
                  <td mat-cell *matCellDef="let r">{{ r.dueDate | date:'EEE dd/MM/yyyy' }}</td>
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
})
export class LoanSimulatorComponent implements OnInit {
  private api    = inject(ApiService);
  private fb     = inject(FormBuilder);
  private pdfSvc = inject(PdfDownloadService);

  loading      = signal(false);
  downloading  = signal(false);
  result       = signal<any>(null);
  plazos       = signal<any[]>([]);
  selectedPlazo = signal<any>(null);

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
      next: (r) => { this.result.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  downloadPdf() {
    if (!this.result()) return;
    this.downloading.set(true);
    this.pdfSvc.downloadPost('/loans/simulate/pdf', 'plan-pagos-simulacion.pdf', {
      principalAmount: this.form.value.principalAmount,
      days:            this.form.value.days,
    });
    setTimeout(() => this.downloading.set(false), 2000);
  }
}