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

            <!-- Tipo de crédito -->
            <mat-form-field appearance="outline">
              <mat-label>Tipo de crédito</mat-label>
              <mat-select formControlName="loanTypeId" (selectionChange)="onTypeChange()">
                @for (t of loanTypes(); track t.id) {
                  <mat-option [value]="t.id">{{ t.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <!-- Monto -->
            <mat-form-field appearance="outline">
              <mat-label>Monto del préstamo *</mat-label>
              <input matInput type="number" formControlName="principalAmount"
                     (change)="onAmountChange()">
              <span matPrefix>$&nbsp;</span>
              @if (currentRange()) {
                <mat-hint>Tasa: {{ (currentRange()!.totalRate * 100).toFixed(0) }}% total</mat-hint>
              }
            </mat-form-field>

            <!-- Plazo — select si hay rangos, input libre si no -->
            <mat-form-field appearance="outline">
              <mat-label>Plazo ({{ unidad() }}) *</mat-label>
              @if (periodsAvailable().length > 0) {
                <mat-select formControlName="termWeeks">
                  @for (p of periodsAvailable(); track p) {
                    <mat-option [value]="p">{{ p }} {{ unidad() }}</mat-option>
                  }
                </mat-select>
              } @else {
                <input matInput type="number" formControlName="termWeeks">
              }
            </mat-form-field>

            <!-- Frecuencia (de solo lectura si viene del tipo) -->
            <mat-form-field appearance="outline">
              <mat-label>Frecuencia *</mat-label>
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
                  <span class="label">Cuotas</span>
                  <span class="value-num">{{ result()!.schedule.length }}</span>
                </div>
              </div>
            </mat-card-content>
          </mat-card>

          <mat-card>
            <mat-card-header><mat-card-title>Tabla de pagos</mat-card-title></mat-card-header>
            <mat-card-content>
              <table mat-table [dataSource]="result()!.schedule" style="width:100%">
                <ng-container matColumnDef="period">
                  <th mat-header-cell *matHeaderCellDef>#</th>
                  <td mat-cell *matCellDef="let r">{{ r.period }}</td>
                </ng-container>
                <ng-container matColumnDef="dueDate">
                  <th mat-header-cell *matHeaderCellDef>Fecha de pago</th>
                  <td mat-cell *matCellDef="let r">{{ r.dueDate | date:'dd/MM/yyyy' }}</td>
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
  loanTypes    = signal<any[]>([]);
  currentRange = signal<any>(null);
  periodsAvailable = signal<number[]>([]);
  unidad       = signal('días');

  cols = ['period', 'dueDate', 'payment'];

  form = this.fb.group({
    loanTypeId:      [''],
    principalAmount: [null as number | null, [Validators.required, Validators.min(1)]],
    termWeeks:       [null as number | null, [Validators.required, Validators.min(1)]],
    frequency:       ['DIARIO', Validators.required],
  });

  ngOnInit() {
    this.api.get<any>('/settings/loan-types').subscribe({
      next: (r) => {
        const list = Array.isArray(r) ? r : r?.data ?? [];
        this.loanTypes.set(list);
      },
    });
  }

  onTypeChange() {
    const type = this.loanTypes().find(t => t.id === this.form.value.loanTypeId);
    if (!type) return;
    const freq = type.frequency || 'DIARIO';
    this.form.patchValue({ frequency: freq, termWeeks: null });
    this.unidad.set(this.freq2unit(freq));
    this.currentRange.set(null);
    this.periodsAvailable.set([]);
    this.result.set(null);
    if (this.form.value.principalAmount) this.loadRange();
  }

  onAmountChange() {
    if (this.form.value.loanTypeId) this.loadRange();
  }

  loadRange() {
    const loanTypeId = this.form.value.loanTypeId;
    const amount     = Number(this.form.value.principalAmount);
    if (!loanTypeId || !amount) return;

    this.api.get<any>('/settings/rate-ranges/by-amount', { loanTypeId, amount }).subscribe({
      next: (r) => {
        if (r) {
          this.currentRange.set(r);
          const periods = Array.isArray(r.periods) ? r.periods : [];
          this.periodsAvailable.set(periods);
          if (periods.length > 0) {
            this.form.patchValue({ termWeeks: Math.max(...periods) });
          }
        } else {
          this.currentRange.set(null);
          this.periodsAvailable.set([]);
        }
      },
      error: () => { this.currentRange.set(null); this.periodsAvailable.set([]); },
    });
  }

  freq2unit(f: string): string {
    return { DIARIO:'días', SEMANAL:'semanas', QUINCENAL:'quincenas', MENSUAL:'meses' }[f] ?? 'períodos';
  }

  simulate() {
    if (this.form.invalid) return;
    this.loading.set(true);
    const range = this.currentRange();
    this.api.post<any>('/loans/simulate', {
      principalAmount: this.form.value.principalAmount,
      termWeeks:       this.form.value.termWeeks,
      frequency:       this.form.value.frequency,
      totalRate:       range ? range.totalRate : undefined,
      interestRate:    range ? 0 : 0.05,
    }).subscribe({
      next: (r) => { this.result.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  downloadPdf() {
    if (!this.result()) return;
    this.downloading.set(true);
    const range = this.currentRange();
    this.pdfSvc.downloadPost('/loans/simulate/pdf', 'plan-pagos-simulacion.pdf', {
      principalAmount: this.form.value.principalAmount,
      termWeeks:       this.form.value.termWeeks,
      frequency:       this.form.value.frequency,
      totalRate:       range ? range.totalRate : undefined,
      interestRate:    range ? 0 : 0.05,
    });
    setTimeout(() => this.downloading.set(false), 2000);
  }
}