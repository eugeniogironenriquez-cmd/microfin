import { Component, inject, signal } from '@angular/core';
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
            <mat-form-field appearance="outline">
              <mat-label>Monto del préstamo</mat-label>
              <input matInput type="number" formControlName="principalAmount">
              <span matPrefix>$&nbsp;</span>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Tasa periódica</mat-label>
              <input matInput type="number" step="0.001" formControlName="interestRate">
              <mat-hint>Ej: 0.05 = 5% por período</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Plazo (semanas)</mat-label>
              <input matInput type="number" formControlName="termWeeks">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Frecuencia</mat-label>
              <mat-select formControlName="frequency">
                <mat-option value="DIARIO">Diario</mat-option>
                <mat-option value="SEMANAL">Semanal</mat-option>
                <mat-option value="QUINCENAL">Quincenal</mat-option>
                <mat-option value="MENSUAL">Mensual</mat-option>
              </mat-select>
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
                  <span class="label">Cuota</span>
                  <span class="value-num value-primary">{{ result()!.periodicPayment | currency:'MXN':'symbol':'1.2-2' }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Total a pagar</span>
                  <span class="value-num">{{ result()!.totalPayment | currency:'MXN':'symbol':'1.2-2' }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Intereses totales</span>
                  <span class="value-num value-warn">{{ result()!.totalInterest | currency:'MXN':'symbol':'1.2-2' }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Cuotas</span>
                  <span class="value-num">{{ result()!.schedule.length }}</span>
                </div>
              </div>
            </mat-card-content>
          </mat-card>

          <mat-card>
            <mat-card-header><mat-card-title>Tabla de amortización</mat-card-title></mat-card-header>
            <mat-card-content>
              <table mat-table [dataSource]="result()!.schedule" style="width:100%">
                <ng-container matColumnDef="period">
                  <th mat-header-cell *matHeaderCellDef>#</th>
                  <td mat-cell *matCellDef="let r">{{ r.period }}</td>
                </ng-container>
                <ng-container matColumnDef="dueDate">
                  <th mat-header-cell *matHeaderCellDef>Fecha</th>
                  <td mat-cell *matCellDef="let r">{{ r.dueDate | date:'dd/MM/yyyy' }}</td>
                </ng-container>
                <ng-container matColumnDef="payment">
                  <th mat-header-cell *matHeaderCellDef>Cuota</th>
                  <td mat-cell *matCellDef="let r">{{ r.payment | currency:'MXN' }}</td>
                </ng-container>
                <ng-container matColumnDef="capital">
                  <th mat-header-cell *matHeaderCellDef>Capital</th>
                  <td mat-cell *matCellDef="let r">{{ r.principal | currency:'MXN' }}</td>
                </ng-container>
                <ng-container matColumnDef="interest">
                  <th mat-header-cell *matHeaderCellDef>Interés</th>
                  <td mat-cell *matCellDef="let r">{{ r.interest | currency:'MXN' }}</td>
                </ng-container>
                <ng-container matColumnDef="balance">
                  <th mat-header-cell *matHeaderCellDef>Saldo</th>
                  <td mat-cell *matCellDef="let r">{{ r.balance | currency:'MXN' }}</td>
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
export class LoanSimulatorComponent {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private pdfSvc = inject(PdfDownloadService);

  loading = signal(false);
  downloading = signal(false);
  result = signal<any>(null);
  cols = ['period', 'dueDate', 'payment', 'capital', 'interest', 'balance'];

  form = this.fb.group({
    principalAmount: [5000, [Validators.required, Validators.min(1)]],
    interestRate:    [0.05, [Validators.required, Validators.min(0.001)]],
    termWeeks:       [12,   [Validators.required, Validators.min(1)]],
    frequency:       ['SEMANAL', Validators.required],
  });

  simulate() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.api.post<any>('/loans/simulate', this.form.value).subscribe({
      next: (r) => { this.result.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  downloadPdf() {
    if (!this.result()) return;
    this.downloading.set(true);
    this.pdfSvc.downloadPost('/loans/simulate/pdf', 'plan-pagos-simulacion.pdf', this.form.value);
    setTimeout(() => this.downloading.set(false), 2000);
  }
}
