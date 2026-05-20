import { Component, OnInit, inject, signal } from '@angular/core';
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
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
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
    MatBadgeModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>payment</mat-icon> Pagos</h1>
    </div>

    <div>
          <div class="payment-layout">

            <!-- Panel izquierdo -->
            <div class="left-panel">

              <!-- Búsqueda -->
              <mat-card>
                <mat-card-header><mat-card-title>Buscar cliente</mat-card-title></mat-card-header>
                <mat-card-content>
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Nombre, CURP o teléfono</mat-label>
                    <input matInput [value]="searchTerm()"
                           (input)="onSearch($event)"
                           placeholder="Ej: Juan García">
                    <mat-icon matPrefix>search</mat-icon>
                    @if (searchLoading()) {
                      <mat-spinner matSuffix diameter="18"></mat-spinner>
                    }
                  </mat-form-field>

                  @for (loan of searchResults(); track loan.id) {
                    <div class="loan-result"
                         [class.selected]="selectedLoan()?.id === loan.id"
                         (click)="selectLoan(loan)">
                      <div class="loan-name">{{ loan.customer?.fullName }}</div>
                      <div class="loan-meta">
                        {{ loan.principalAmount | currency:'MXN' }} ·
                        Cuota: {{ loan.periodicPayment | currency:'MXN' }} ·
                        <span class="badge badge-{{ loan.status | lowercase }}">{{ loan.status }}</span>
                      </div>
                    </div>
                  }

                  <!-- Si el cliente tiene múltiples créditos activos -->
                  @if (multipleLoans().length > 1) {
                    <div class="multi-loan-alert">
                      <mat-icon>info</mat-icon>
                      <span>Este cliente tiene <strong>{{ multipleLoans().length }}</strong> créditos activos. Selecciona a cuál aplicar el pago:</span>
                    </div>
                    <div class="loan-selector">
                      @for (l of multipleLoans(); track l.id) {
                        <div class="loan-option"
                             [class.active]="selectedLoan()?.id === l.id"
                             (click)="setActiveLoan(l)">
                          <div class="loan-option-top">
                            <mat-icon>{{ selectedLoan()?.id === l.id ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
                            <strong>{{ l.principalAmount | currency:'MXN' }}</strong>
                            <span class="badge badge-{{ l.status | lowercase }}">{{ l.status }}</span>
                          </div>
                          <div class="loan-option-sub">
                            {{ l.termWeeks }} períodos · {{ l.frequency }} ·
                            Cuota: <strong>{{ l.periodicPayment | currency:'MXN' }}</strong>
                          </div>
                          <div class="loan-option-sub">
                            Desembolso: {{ l.disbursedAt | date:'dd/MM/yyyy' }}
                          </div>
                        </div>
                      }
                    </div>
                  }
                </mat-card-content>
              </mat-card>

              <!-- Formulario pago -->
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
                        <input matInput formControlName="reference">
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="w-full">
                        <mat-label>Observaciones</mat-label>
                        <textarea matInput formControlName="notes" rows="2"></textarea>
                      </mat-form-field>

                      <button mat-raised-button color="primary" type="submit" class="pay-btn"
                              [disabled]="paymentForm.invalid || saving()">
                        @if (saving()) { <mat-spinner diameter="22"></mat-spinner> }
                        @else { <mat-icon>check_circle</mat-icon> }
                        Registrar pago
                      </button>
                    </form>
                  </mat-card-content>
                </mat-card>
              }

              <!-- Resultado del pago -->
              @if (paymentResult()) {
                <mat-card class="result-card mt-16">
                  <mat-card-content>
                    <div class="result-header">
                      <mat-icon style="color:#16A34A;font-size:32px;width:32px;height:32px">check_circle</mat-icon>
                      <h3>Pago registrado</h3>
                    </div>
                    <div class="result-grid">
                      <div class="result-item">
                        <span>Capital</span>
                        <strong>{{ paymentResult()!.applied?.capitalApplied | currency:'MXN' }}</strong>
                      </div>
                      <div class="result-item">
                        <span>Interés</span>
                        <strong>{{ paymentResult()!.applied?.interestApplied | currency:'MXN' }}</strong>
                      </div>
                      <div class="result-item">
                        <span>Moratorio</span>
                        <strong>{{ paymentResult()!.applied?.lateInterestApplied | currency:'MXN' }}</strong>
                      </div>
                    </div>
                    <div class="result-actions">
                      <button mat-raised-button color="primary" (click)="downloadReceipt()">
                        <mat-icon>receipt</mat-icon> Descargar ticket
                      </button>
                      <button mat-stroked-button (click)="clearPayment()">
                        <mat-icon>refresh</mat-icon> Nuevo pago
                      </button>
                    </div>
                  </mat-card-content>
                </mat-card>
              }
            </div>

            <!-- Panel derecho: calendario -->
            @if (selectedLoan() && schedule().length > 0) {
              <mat-card class="schedule-card">
                <mat-card-header>
                  <mat-card-title>Calendario de pagos</mat-card-title>
                  <mat-card-subtitle>
                    Próximo: {{ nextDue()?.dueDate | date:'dd/MM/yyyy' }}
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
                        <span class="badge badge-{{ r.status | lowercase }}">{{ r.status }}</span>
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
        </div>


  `,
  styles: [`
    .tab-content { padding: 16px 0; }
    .payment-layout { display:grid; grid-template-columns:380px 1fr; gap:16px; align-items:start; }
    @media(max-width:900px){ .payment-layout { grid-template-columns:1fr; } }

    /* Búsqueda */
    .loan-result {
      padding:10px 12px; border-radius:8px; cursor:pointer;
      border:1px solid #E2E8F0; margin-bottom:6px; transition:.15s;
    }
    .loan-result:hover { border-color:#1C4532; background:#F0FFF4; }
    .loan-result.selected { border-color:#1C4532; background:#F0FFF4; box-shadow:0 0 0 2px #1C4532; }
    .loan-name { font-weight:600; font-size:14px; }
    .loan-meta { font-size:12px; color:#718096; margin-top:2px; }

    /* Multi préstamo */
    .multi-loan-alert {
      display:flex; align-items:flex-start; gap:8px; padding:10px 12px;
      background:#FFF7ED; border:1px solid #FED7AA; border-radius:8px;
      margin:8px 0; font-size:13px; color:#92400E;
    }
    .multi-loan-alert mat-icon { color:#F59E0B; flex-shrink:0; }
    .loan-selector { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
    .loan-option {
      padding:10px 12px; border-radius:8px; cursor:pointer;
      border:2px solid #E2E8F0; transition:.15s;
    }
    .loan-option:hover { border-color:#4ade80; }
    .loan-option.active { border-color:#1C4532; background:#F0FFF4; }
    .loan-option-top { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
    .loan-option-top mat-icon { color:#718096; font-size:18px; width:18px; height:18px; }
    .loan-option.active .loan-option-top mat-icon { color:#1C4532; }
    .loan-option-sub { font-size:12px; color:#718096; padding-left:26px; }

    /* Formulario */
    .payment-form { display:flex; flex-direction:column; gap:12px; }
    .pay-btn { height:48px; font-size:15px; font-weight:600; width:100%; }
    .w-full { width:100%; }

    /* Resultado */
    .result-card { border-left:4px solid #16A34A; }
    .result-header { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
    .result-header h3 { margin:0; font-size:18px; font-weight:700; color:#171923; }
    .result-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px; }
    .result-item { display:flex; flex-direction:column; gap:2px; }
    .result-item span { font-size:11px; color:#718096; text-transform:uppercase; }
    .result-item strong { font-size:16px; font-weight:700; color:#171923; }
    .result-actions { display:flex; gap:10px; flex-wrap:wrap; }

    /* Monitor KPIs */
    .monitor-kpis {
      display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px;
    }
    @media(max-width:800px){ .monitor-kpis { grid-template-columns:1fr 1fr; } }
    .mkpi {
      border-radius:14px; padding:18px 16px; color:#fff;
      box-shadow:0 4px 16px rgba(0,0,0,.12);
    }
    .mkpi-green  { background:linear-gradient(135deg,#1C4532,#276749); }
    .mkpi-blue   { background:linear-gradient(135deg,#4F7AF8,#6B5CE7); }
    .mkpi-amber  { background:linear-gradient(135deg,#F59E0B,#D97706); }
    .mkpi-purple { background:linear-gradient(135deg,#9B59B6,#6B5CE7); }
    .mkpi-val   { font-size:26px; font-weight:700; line-height:1; margin-bottom:6px; }
    .mkpi-label { font-size:12px; color:rgba(255,255,255,.75); }

    .refresh-bar {
      display:flex; align-items:center; gap:6px; font-size:12px;
      color:#718096; margin-bottom:12px;
    }
    .monitor-count {
      background:#DC2626; color:#fff; border-radius:10px;
      padding:1px 7px; font-size:11px; font-weight:700; margin-left:6px;
    }

    .client-name { font-weight:600; font-size:13px; }
    .client-sub  { font-size:11px; color:#718096; }
    .overdue { color:#DC2626; }
    .days-badge {
      background:#FEE2E2; color:#DC2626; font-size:10px;
      border-radius:4px; padding:1px 4px; margin-left:4px;
    }
    .paid-row { opacity:.55; }
    .schedule-card { max-height:600px; overflow-y:auto; }
    .mt-16 { margin-top:16px; }
  `],
})
export class PaymentsRegisterComponent implements OnInit {
  private api      = inject(ApiService);
  private fb       = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);
  private pdfSvc   = inject(PdfDownloadService);

  // Búsqueda
  searchTerm    = signal('');
  searchResults = signal<Loan[]>([]);
  searchLoading = signal(false);
  multipleLoans = signal<Loan[]>([]);

  // Selección
  selectedLoan  = signal<Loan | null>(null);
  schedule      = signal<PaymentSchedule[]>([]);

  // Pago
  saving        = signal(false);
  paymentResult = signal<any>(null);
  lastPaymentId = signal<string | null>(null);


  scheduleCols = ['period', 'dueDate', 'balance', 'status'];
  monitorCols  = ['hora', 'cliente', 'monto', 'capital', 'interes', 'moratorio', 'forma', 'ticket'];

  private searchSubject = new Subject<string>();


  paymentForm = this.fb.group({
    amountPaid: [null as number | null, [Validators.required, Validators.min(0.01)]],
    method:     ['EFECTIVO', Validators.required],
    reference:  [''],
    notes:      [''],
  });

  ngOnInit() {
    this.searchSubject.pipe(debounceTime(400), distinctUntilChanged()).subscribe((term) => {
      if (!term || term.length < 3) { this.searchResults.set([]); this.multipleLoans.set([]); return; }
      this.searchLoading.set(true);
      this.api.get<any>('/loans', { search: term, limit: 10 }).subscribe({
        next: (r) => {
          const all = Array.isArray(r) ? r : r?.data ?? [];
          const active = all.filter((l: any) => l.status === 'ACTIVO' || l.status === 'VENCIDO');
          this.searchResults.set(active);
          this.searchLoading.set(false);
        },
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
    // Buscar todos los créditos activos de este cliente
    this.api.get<any>('/loans', { customerId: loan.customerId, limit: 20 }).subscribe({
      next: (r) => {
        const all = Array.isArray(r) ? r : r?.data ?? [];
        const active = all.filter((l: any) => l.status === 'ACTIVO' || l.status === 'VENCIDO');
        this.multipleLoans.set(active);
        // Si solo hay uno, seleccionarlo directo
        if (active.length === 1) {
          this.setActiveLoan(active[0]);
        } else {
          // Preseleccionar el que se clickeó
          this.setActiveLoan(loan);
        }
      },
    });
  }

  setActiveLoan(loan: Loan) {
    this.selectedLoan.set(loan);
    this.paymentResult.set(null);
    this.paymentForm.patchValue({ amountPaid: Number(loan.periodicPayment) });
    this.api.get<any>(`/loans/${loan.id}/schedule`).subscribe({
      next: (s) => this.schedule.set(Array.isArray(s) ? s : s?.data ?? []),
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
        this.lastPaymentId.set(result?.payment?.id || null);
        this.saving.set(false);
        this.paymentForm.patchValue({ amountPaid: Number(this.selectedLoan()!.periodicPayment) });
        // Recargar calendario
        this.api.get<any>(`/loans/${this.selectedLoan()!.id}/schedule`).subscribe({
          next: (s) => this.schedule.set(Array.isArray(s) ? s : s?.data ?? []),
        });
        // Descargar ticket automáticamente
        if (result?.payment?.id) {
          setTimeout(() => this.downloadReceiptById(result.payment.id), 800);
        }
      },
      error: (err) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error al registrar pago', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  downloadReceipt() {
    const id = this.lastPaymentId();
    if (id) this.downloadReceiptById(id);
  }

  downloadReceiptById(id: string) {
    this.pdfSvc.download(`/payments/${id}/receipt`, `ticket-${id.substring(0,8)}.pdf`);
  }

  clearPayment() {
    this.paymentResult.set(null);
    this.lastPaymentId.set(null);
    this.selectedLoan.set(null);
    this.multipleLoans.set([]);
    this.searchResults.set([]);
    this.searchTerm.set('');
    this.schedule.set([]);
    this.paymentForm.reset({ method: 'EFECTIVO' });
  }

}