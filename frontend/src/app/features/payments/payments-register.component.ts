import { Component, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { PdfDownloadService } from '../../core/pdf-download.service';
import { ApiService, Loan, PaymentSchedule } from '../../core/index';

@Component({
  selector: 'app-payments-register',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatTableModule, MatDividerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>payment</mat-icon> Registrar pago</h1>
    </div>

    <div class="payment-layout">
      <!-- Panel izquierdo: búsqueda + formulario -->
      <div class="left-panel">
        <!-- Búsqueda de préstamo -->
        <mat-card>
          <mat-card-header><mat-card-title>Buscar préstamo</mat-card-title></mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Nombre del cliente</mat-label>
              <input matInput [value]="searchTerm()" (input)="onSearch($event)"
                     placeholder="Ej: Juan García">
              <mat-icon matPrefix>search</mat-icon>
              @if (searchLoading()) { <mat-spinner matSuffix diameter="18"></mat-spinner> }
            </mat-form-field>

            @for (loan of searchResults(); track loan.id) {
              <div class="loan-result" [class.selected]="selectedLoan()?.id === loan.id"
                   (click)="selectLoan(loan)">
                <div class="loan-name">{{ loan.customer?.fullName }}</div>
                <div class="loan-meta">
                  Préstamo: {{ loan.principalAmount | currency:'MXN' }} —
                  Cuota: {{ loan.periodicPayment | currency:'MXN' }} —
                  <span class="status-badge status-{{ loan.status | lowercase }}">{{ loan.status }}</span>
                </div>
              </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Formulario de pago -->
        @if (selectedLoan()) {
          <mat-card class="mt-16">
            <mat-card-header>
              <mat-card-title>Datos del pago</mat-card-title>
              <mat-card-subtitle>{{ selectedLoan()!.customer?.fullName }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <form [formGroup]="paymentForm" (ngSubmit)="registerPayment()" class="payment-form">
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Monto recibido *</mat-label>
                  <input matInput type="number" step="0.01" formControlName="amountPaid">
                  <span matPrefix>$&nbsp;</span>
                  <mat-hint>Cuota: {{ selectedLoan()!.periodicPayment | currency:'MXN' }}</mat-hint>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Forma de pago *</mat-label>
                  <mat-select formControlName="method">
                    <mat-option value="EFECTIVO">Efectivo</mat-option>
                    <mat-option value="TRANSFERENCIA">Transferencia</mat-option>
                    <mat-option value="TARJETA">Tarjeta</mat-option>
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Referencia (opcional)</mat-label>
                  <input matInput formControlName="reference" placeholder="Número de transacción">
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Observaciones</mat-label>
                  <textarea matInput formControlName="notes" rows="2"></textarea>
                </mat-form-field>

                <button mat-raised-button color="primary" type="submit" class="w-full"
                        [disabled]="paymentForm.invalid || saving()">
                  @if (saving()) { <mat-spinner diameter="22"></mat-spinner> }
                  @else { <mat-icon>check_circle</mat-icon> }
                  Registrar pago
                </button>
              </form>
            </mat-card-content>
          </mat-card>
        }
      </div>

      <!-- Panel derecho: calendario de pagos -->
      @if (selectedLoan() && schedule().length > 0) {
        <mat-card class="schedule-card">
          <mat-card-header>
            <mat-card-title>Calendario de pagos</mat-card-title>
            <mat-card-subtitle>
              Próximo pago: {{ nextDue()?.dueDate | date:'dd/MM/yyyy' }}
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <table mat-table [dataSource]="schedule()">
              <ng-container matColumnDef="period">
                <th mat-header-cell *matHeaderCellDef>#</th>
                <td mat-cell *matCellDef="let r">{{ r.periodNumber }}</td>
              </ng-container>
              <ng-container matColumnDef="dueDate">
                <th mat-header-cell *matHeaderCellDef>Vence</th>
                <td mat-cell *matCellDef="let r" [class.overdue]="r.daysOverdue > 0">
                  {{ r.dueDate | date:'dd/MM/yy' }}
                  @if (r.daysOverdue > 0) {
                    <span class="days-badge">+{{ r.daysOverdue }}d</span>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="balance">
                <th mat-header-cell *matHeaderCellDef>Saldo</th>
                <td mat-cell *matCellDef="let r">{{ r.balanceDue | currency:'MXN' }}</td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Estado</th>
                <td mat-cell *matCellDef="let r">
                  <span class="status-badge status-{{ r.status | lowercase }}">{{ r.status }}</span>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="scheduleCols"></tr>
              <tr mat-row *matRowDef="let row; columns: scheduleCols;"
                  [class.paid-row]="row.status === 'PAGADO'"></tr>
            </table>
          </mat-card-content>
        </mat-card>
      }
    </div>

    <!-- Resultado del pago -->
    @if (paymentResult()) {
      <mat-card class="result-card mt-16">
        <mat-card-content>
          <div class="result-header">
            <mat-icon color="primary">check_circle</mat-icon>
            <h3>Pago registrado exitosamente</h3>
          </div>
          <div class="result-grid">
            <div class="result-item">
              <span>Moratorios aplicados</span>
              <strong>{{ paymentResult()!.applied.lateInterest | currency:'MXN' }}</strong>
            </div>
            <div class="result-item">
              <span>Interés ordinario</span>
              <strong>{{ paymentResult()!.applied.interest | currency:'MXN' }}</strong>
            </div>
            <div class="result-item">
              <span>Capital amortizado</span>
              <strong>{{ paymentResult()!.applied.capital | currency:'MXN' }}</strong>
            </div>
            @if (paymentResult()!.applied.change > 0) {
              <div class="result-item highlight">
                <span>Cambio a devolver</span>
                <strong>{{ paymentResult()!.applied.change | currency:'MXN' }}</strong>
              </div>
            }
          </div>
          <button mat-stroked-button (click)="paymentResult.set(null)" class="mt-16">
            <mat-icon>refresh</mat-icon> Registrar otro pago
          </button>
        </mat-card-content>
      </mat-card>
    }
  `
})
export class PaymentsRegisterComponent {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);
  private pdfSvc = inject(PdfDownloadService);

  searchTerm = signal('');
  searchResults = signal<Loan[]>([]);
  searchLoading = signal(false);
  selectedLoan = signal<Loan | null>(null);
  schedule = signal<PaymentSchedule[]>([]);
  saving = signal(false);
  paymentResult = signal<any>(null);
  lastPaymentId = signal<string | null>(null);
  scheduleCols = ['period', 'dueDate', 'balance', 'status'];

  private searchSubject = new Subject<string>();

  paymentForm = this.fb.group({
    amountPaid: [null as number | null, [Validators.required, Validators.min(0.01)]],
    method: ['EFECTIVO', Validators.required],
    reference: [''],
    notes: [''],
  });

  constructor() {
    this.searchSubject.pipe(debounceTime(400), distinctUntilChanged()).subscribe((term) => {
      if (!term || term.length < 3) { this.searchResults.set([]); return; }
      this.searchLoading.set(true);
      this.api.get<any>('/loans', { search: term, status: 'ACTIVO', limit: 5 }).subscribe({
        next: (r) => { this.searchResults.set(r.data || []); this.searchLoading.set(false); },
        error: () => this.searchLoading.set(false),
      });
    });
  }

  onSearch(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.searchTerm.set(term);
    this.searchSubject.next(term);
  }

  selectLoan(loan: Loan) {
    this.selectedLoan.set(loan);
    this.paymentResult.set(null);
    this.paymentForm.patchValue({ amountPaid: Number(loan.periodicPayment) });
    this.api.get<PaymentSchedule[]>(`/payments/schedule/${loan.id}`).subscribe({
      next: (s) => this.schedule.set(s),
    });
  }

  nextDue() {
    return this.schedule().find((s) => s.status !== 'PAGADO');
  }

  registerPayment() {
    if (this.paymentForm.invalid || !this.selectedLoan()) return;
    this.saving.set(true);
    this.api.post<any>('/payments', {
      loanId: this.selectedLoan()!.id,
      ...this.paymentForm.value,
    }).subscribe({
      next: (result) => {
        this.paymentResult.set(result);
        if (result?.payment?.id) {
          this.lastPaymentId.set(result.payment.id);
        }
        this.saving.set(false);
        this.paymentForm.reset({ method: 'EFECTIVO' });
        // Recargar calendario
        this.api.get<PaymentSchedule[]>(`/payments/schedule/${this.selectedLoan()!.id}`)
          .subscribe((s) => this.schedule.set(s));
      },
      error: (err) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error al registrar pago', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  downloadReceipt() {
    const id = this.lastPaymentId();
    if (!id) return;
    this.pdfSvc.download('/payments/' + id + '/receipt', 'comprobante-pago-' + id.substring(0,8) + '.pdf');
  }
}
