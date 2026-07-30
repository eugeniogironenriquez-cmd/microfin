import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatStepperModule } from '@angular/material/stepper';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { ApiService, AuthService, Customer, Loan, PagedResponse } from '../../core/index';

@Component({
  selector: 'app-restructuring',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule,
    MatTableModule, MatDividerModule, MatAutocompleteModule, MatStepperModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>swap_horiz</mat-icon> Reestructuración de créditos</h1>
    </div>

    <div class="rest-layout">

      <!-- Panel izquierdo: buscar crédito -->
      <mat-card class="search-card">
        <mat-card-header>
          <mat-card-title>Buscar crédito a reestructurar</mat-card-title>
          <mat-card-subtitle>Solo créditos ACTIVO o VENCIDO</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Nombre, CURP o teléfono del cliente</mat-label>
            <input matInput [value]="customerSearch()"
                   (input)="onSearch($event)"
                   [matAutocomplete]="auto">
            <mat-icon matPrefix>search</mat-icon>
            <mat-autocomplete #auto="matAutocomplete"
                              (optionSelected)="selectCustomer($event.option.value)">
              @for (c of customers(); track c.id) {
                <mat-option [value]="c">
                  {{ c.fullName }} — {{ c.phone }}
                </mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>

          <!-- Créditos del cliente -->
          @if (selectedCustomer()) {
            <div class="customer-selected">
              <mat-icon style="color:#16A34A">person</mat-icon>
              <strong>{{ selectedCustomer()!.fullName }}</strong>
            </div>

            @if (loadingLoans()) {
              <div class="loading-row"><mat-spinner diameter="24"></mat-spinner> Cargando créditos...</div>
            } @else if (customerLoans().length === 0) {
              <div class="empty-state" style="padding:16px">
                <mat-icon>info</mat-icon>
                <p>Sin créditos activos o vencidos</p>
              </div>
            } @else {
              <div class="loan-list">
                @for (loan of customerLoans(); track loan.id) {
                  <div class="loan-item" [class.selected]="selectedLoan()?.id === loan.id"
                       (click)="selectLoan(loan)">
                    <div class="loan-item-top">
                      <span class="badge badge-{{ loan.status | lowercase }}">{{ loan.status }}</span>
                      <strong>{{ loan.principalAmount | currency:'MXN' }}</strong>
                    </div>
                    <div class="loan-item-sub">
                      {{ loan.termWeeks }} períodos · {{ loan.frequency }} ·
                      Cuota: {{ loan.periodicPayment | currency:'MXN' }}
                    </div>
                    <div class="loan-item-sub">
                      Desembolso: {{ loan.disbursedAt | date:'dd/MM/yyyy' }}
                    </div>
                  </div>
                }
              </div>
            }
          }
        </mat-card-content>
      </mat-card>

      <!-- Panel derecho: formulario de reestructura -->
      <div class="form-panel">
        @if (!selectedLoan()) {
          <mat-card>
            <mat-card-content>
              <div class="empty-state">
                <mat-icon>swap_horiz</mat-icon>
                <p>Selecciona un crédito de la izquierda para reestructurar</p>
              </div>
            </mat-card-content>
          </mat-card>
        } @else {
          <!-- Resumen del crédito actual -->
          <mat-card class="current-loan-card">
            <mat-card-header>
              <mat-card-title>Crédito actual</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="summary-grid">
                <div class="summary-item">
                  <span>Monto original</span>
                  <strong>{{ selectedLoan()!.principalAmount | currency:'MXN' }}</strong>
                </div>
                <div class="summary-item">
                  <span>Saldo pendiente</span>
                  <strong style="color:#DC2626">{{ pendingBalance() | currency:'MXN' }}</strong>
                </div>
                <div class="summary-item">
                  <span>Cuota actual</span>
                  <strong>{{ selectedLoan()!.periodicPayment | currency:'MXN' }}</strong>
                </div>
                <div class="summary-item">
                  <span>Frecuencia</span>
                  <strong>{{ selectedLoan()!.frequency }}</strong>
                </div>
                <div class="summary-item">
                  <span>Cuotas vencidas</span>
                  <strong style="color:#DC2626">{{ overdueCount() }}</strong>
                </div>
                <div class="summary-item">
                  <span>Reestructuras previas</span>
                  <strong>{{ selectedLoan()!.restructureCount }}</strong>
                </div>
              </div>
            </mat-card-content>
          </mat-card>

          <!-- Formulario nuevas condiciones -->
          <mat-card style="margin-top:16px">
            <mat-card-header>
              <mat-card-title>Nuevas condiciones</mat-card-title>
              <mat-card-subtitle>El crédito actual se cerrará y se creará uno nuevo</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <form [formGroup]="restForm" (ngSubmit)="restructure()">
                <div class="form-grid">
                  <mat-form-field appearance="outline">
                    <mat-label>Nuevo monto *</mat-label>
                    <input matInput type="number" formControlName="principalAmount"
                           (change)="onAmountChange()">
                    <span matPrefix>$&nbsp;</span>
                    <mat-hint>Puede incluir saldo + moratorio pendiente</mat-hint>
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Nuevo plazo (períodos) *</mat-label>
                    <input matInput type="number" formControlName="termWeeks"
                           (change)="calculatePreview()">
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Frecuencia *</mat-label>
                    <mat-select formControlName="frequency" (selectionChange)="calculatePreview()">
                      <mat-option value="DIARIO">Diario</mat-option>
                      <mat-option value="SEMANAL">Semanal</mat-option>
                      <mat-option value="QUINCENAL">Quincenal</mat-option>
                      <mat-option value="MENSUAL">Mensual</mat-option>
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Tasa de interés total *</mat-label>
                    <input matInput type="number" step="0.01" formControlName="totalRate"
                           (change)="calculatePreview()">
                    <span matSuffix>&nbsp;%</span>
                    <mat-hint>Ej: 29 = 29% sobre el capital</mat-hint>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="col-span-2">
                    <mat-label>Motivo de reestructura *</mat-label>
                    <textarea matInput formControlName="restructureReason" rows="2"
                              placeholder="Ej: Cliente con dificultades de pago, acuerdo de nueva fecha...">
                    </textarea>
                  </mat-form-field>
                </div>

                <!-- Preview nueva cuota -->
                @if (preview()) {
                  <div class="preview-box">
                    <strong>Vista previa — nuevas condiciones</strong>
                    <div class="preview-grid">
                      <div class="preview-item">
                        <span>Nueva cuota</span>
                        <strong class="preview-value">{{ preview()!.cuota | currency:'MXN' }}</strong>
                      </div>
                      <div class="preview-item">
                        <span>Total a pagar</span>
                        <strong class="preview-value">{{ preview()!.total | currency:'MXN' }}</strong>
                      </div>
                      <div class="preview-item">
                        <span>Total intereses</span>
                        <strong class="preview-value" style="color:#DC2626">
                          {{ preview()!.interes | currency:'MXN' }}
                        </strong>
                      </div>
                    </div>
                  </div>
                }

                <div class="form-actions" style="margin-top:20px">
                  <button mat-raised-button color="warn" type="submit"
                          [disabled]="restForm.invalid || saving()">
                    @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                    @else { <mat-icon>swap_horiz</mat-icon> }
                    Confirmar reestructuración
                  </button>
                </div>
              </form>
            </mat-card-content>
          </mat-card>
        }
      </div>

    </div>
  `,
  styles: [`
    .rest-layout { display:grid; grid-template-columns:360px 1fr; gap:16px; align-items:start; }
    @media(max-width:900px){ .rest-layout { grid-template-columns:1fr; } }

    .search-card { position:sticky; top:16px; }
    .loading-row { display:flex; align-items:center; gap:8px; color:#718096; padding:8px 0; }

    .loan-list { display:flex; flex-direction:column; gap:8px; margin-top:12px; }
    .loan-item {
      border:1px solid #CBD5E0; border-radius:10px; padding:12px 14px;
      cursor:pointer; transition:all .15s;
    }
    .loan-item:hover { border-color:#1C4532; background:#F0FFF4; }
    .loan-item.selected { border-color:#1C4532; background:#F0FFF4; box-shadow:0 0 0 2px #1C4532; }
    .loan-item-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
    .loan-item-sub { font-size:12px; color:#718096; margin-top:2px; }

    .summary-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
    @media(max-width:600px){ .summary-grid { grid-template-columns:1fr 1fr; } }
    .summary-item { display:flex; flex-direction:column; gap:2px; }
    .summary-item span { font-size:11px; color:#718096; text-transform:uppercase; }
    .summary-item strong { font-size:16px; color:#171923; }

    .preview-box {
      background:#F0FFF4; border:1px solid #BBF7D0;
      border-radius:10px; padding:14px 16px; margin-top:12px;
    }
    .preview-box strong { font-size:13px; color:#1C4532; display:block; margin-bottom:10px; }
    .preview-grid { display:flex; gap:24px; flex-wrap:wrap; }
    .preview-item { display:flex; flex-direction:column; gap:3px; }
    .preview-item span { font-size:11px; color:#718096; }
    .preview-value { font-size:18px; font-weight:700; color:#171923; }

    .current-loan-card { background:#FFFBEB; }
    .form-panel { display:flex; flex-direction:column; gap:0; }
    .col-span-2 { grid-column:1/-1; }
    .w-full { width:100%; }
    .customer-selected {
      display:flex; align-items:center; gap:8px; padding:8px 0;
      border-bottom:1px solid #E2E8F0; margin-bottom:12px;
    }
  `],
})
export class RestructuringComponent implements OnInit {
  private api      = inject(ApiService);
  private fb       = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  customers      = signal<Customer[]>([]);
  customerLoans  = signal<Loan[]>([]);
  selectedCustomer = signal<Customer | null>(null);
  selectedLoan   = signal<Loan | null>(null);
  pendingBalance = signal(0);
  overdueCount   = signal(0);
  loadingLoans   = signal(false);
  saving         = signal(false);
  preview        = signal<any>(null);
  customerSearch = signal('');

  private searchSubject = new Subject<string>();

  restForm = this.fb.group({
    principalAmount:    [null as number | null, [Validators.required, Validators.min(1)]],
    termWeeks:          [null as number | null, [Validators.required, Validators.min(1)]],
    frequency:          ['DIARIO', Validators.required],
    totalRate:          [null as number | null, [Validators.required, Validators.min(0.01)]],
    restructureReason:  ['', Validators.required],
  });

  ngOnInit() {
    this.searchSubject.pipe(debounceTime(350), distinctUntilChanged()).subscribe((term) => {
      if (!term || term.length < 2) { this.customers.set([]); return; }
      this.api.get<any>('/customers', { search: term, limit: 6 }).subscribe({
        next: (r) => this.customers.set(Array.isArray(r) ? r : r?.data ?? []),
      });
    });
  }

  onSearch(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.customerSearch.set(term);
    this.searchSubject.next(term);
  }

  selectCustomer(c: Customer) {
    this.selectedCustomer.set(c);
    this.customerSearch.set(c.fullName);
    this.selectedLoan.set(null);
    this.loadingLoans.set(true);
    this.api.get<any>('/loans', { customerId: c.id, limit: 20 }).subscribe({
      next: (r) => {
        const all = Array.isArray(r) ? r : r?.data ?? [];
        // Solo ACTIVO y VENCIDO
        this.customerLoans.set(all.filter((l: any) =>
          l.status === 'ACTIVO' || l.status === 'VENCIDO'
        ));
        this.loadingLoans.set(false);
      },
      error: () => this.loadingLoans.set(false),
    });
  }

  selectLoan(loan: Loan) {
    this.selectedLoan.set(loan);
    // Cargar detalle para calcular saldo pendiente
    this.api.get<any>(`/loans/${loan.id}`).subscribe({
      next: (detail) => {
        const schedules = detail.paymentSchedules || [];
        const pending = schedules
          .filter((s: any) => s.status === 'PENDIENTE' || s.status === 'PARCIAL')
          .reduce((sum: number, s: any) => sum + Number(s.balanceDue), 0);
        const overdue = schedules
          .filter((s: any) => (s.status === 'PENDIENTE' || s.status === 'PARCIAL')
            && new Date(s.dueDate) < new Date()).length;
        this.pendingBalance.set(Math.round(pending * 100) / 100);
        this.overdueCount.set(overdue);
        // Pre-llenar formulario con datos del crédito actual
        this.restForm.patchValue({
          principalAmount: Math.round(pending * 100) / 100,
          frequency:       loan.frequency,
          termWeeks:       loan.termWeeks,
        });
        this.calculatePreview();
      },
    });
  }

  onAmountChange() { this.calculatePreview(); }

  calculatePreview() {
    const v = this.restForm.value;
    if (!v.principalAmount || !v.termWeeks || !v.totalRate) { this.preview.set(null); return; }
    const rate  = Number(v.totalRate) / 100;
    const total = Math.round(Number(v.principalAmount) * (1 + rate) * 100) / 100;
    const cuota = Math.round(total / Number(v.termWeeks) * 100) / 100;
    this.preview.set({ cuota, total, interes: Math.round((total - Number(v.principalAmount)) * 100) / 100 });
  }

  restructure() {
    if (this.restForm.invalid || !this.selectedLoan()) return;
    this.saving.set(true);
    const v     = this.restForm.value;
    const loan  = this.selectedLoan()!;

    this.api.post<any>(`/loans/${loan.id}/restructure`, {
      principalAmount:   v.principalAmount,
      termWeeks:         v.termWeeks,
      frequency:         v.frequency,
      totalRate:         Number(v.totalRate!) / 100,
      interestRate:      0,
      restructureReason: v.restructureReason,
      loanTypeId:        loan.loanTypeId,
      customerId:        loan.customerId,
    }).subscribe({
      next: () => {
        this.snackbar.open('Crédito reestructurado correctamente', 'OK', { duration: 4000 });
        this.saving.set(false);
        this.selectedLoan.set(null);
        this.selectedCustomer.set(null);
        this.customerSearch.set('');
        this.customerLoans.set([]);
        this.restForm.reset({ frequency: 'DIARIO' });
        this.preview.set(null);
      },
      error: (err: any) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error al reestructurar', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }
}
