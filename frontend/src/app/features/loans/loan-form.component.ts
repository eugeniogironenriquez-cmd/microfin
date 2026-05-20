import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDividerModule } from '@angular/material/divider';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { ApiService, Customer, LoanType, PagedResponse, Loan } from '../../core/index';
import { PdfDownloadService } from '../../core/pdf-download.service';

function unidadPlazo(freq: string): string {
  const map: Record<string, string> = {
    DIARIO: 'días', SEMANAL: 'semanas', QUINCENAL: 'quincenas', MENSUAL: 'meses',
  };
  return map[freq] ?? 'períodos';
}

@Component({
  selector: 'app-loan-form',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatAutocompleteModule, MatDividerModule,
    MatStepperModule, MatTableModule, MatChipsModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>add_circle</mat-icon> Nueva solicitud de crédito</h1>
      <a mat-stroked-button routerLink="/loans"><mat-icon>arrow_back</mat-icon> Préstamos</a>
    </div>

    <mat-stepper linear #stepper>

      <!-- PASO 1 -->
      <mat-step label="Datos del crédito" [completed]="!!createdLoan()">
        <mat-card>
          <mat-card-content>
            <form [formGroup]="form" (ngSubmit)="submit()">

              <!-- CLIENTE -->
              <h3 class="section-title">Cliente</h3>
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Buscar cliente por nombre, CURP o teléfono</mat-label>
                <input matInput [value]="customerSearch()"
                       (input)="onCustomerSearch($event)"
                       [matAutocomplete]="customerAuto">
                <mat-icon matPrefix>search</mat-icon>
                <mat-autocomplete #customerAuto="matAutocomplete"
                                  (optionSelected)="selectCustomer($event.option.value)">
                  @for (c of customers(); track c.id) {
                    <mat-option [value]="c">{{ c.fullName }} — {{ c.curp }} | {{ c.phone }}</mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>

              @if (selectedCustomer()) {
                <div class="customer-selected">
                  <mat-icon style="color:#16A34A">check_circle</mat-icon>
                  <strong>{{ selectedCustomer()!.fullName }}</strong>
                  <span class="text-muted">{{ selectedCustomer()!.phone }}</span>
                  <button mat-icon-button type="button" (click)="clearCustomer()">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>

                @if (loadingHistory()) {
                  <div style="display:flex;align-items:center;gap:8px;margin:12px 0;color:rgba(0,0,0,.5)">
                    <mat-spinner diameter="16"></mat-spinner> Cargando historial...
                  </div>
                } @else if (customerLoans().length > 0) {
                  <div class="loan-history">
                    <h4 class="history-title"><mat-icon>history</mat-icon> Historial de créditos</h4>
                    <table mat-table [dataSource]="customerLoans()" class="history-table">
                      <ng-container matColumnDef="fecha">
                        <th mat-header-cell *matHeaderCellDef>Fecha</th>
                        <td mat-cell *matCellDef="let r">{{ r.createdAt | date:'dd/MM/yy' }}</td>
                      </ng-container>
                      <ng-container matColumnDef="monto">
                        <th mat-header-cell *matHeaderCellDef>Monto</th>
                        <td mat-cell *matCellDef="let r">{{ r.principalAmount | currency:'MXN' }}</td>
                      </ng-container>
                      <ng-container matColumnDef="plazo">
                        <th mat-header-cell *matHeaderCellDef>Plazo</th>
                        <td mat-cell *matCellDef="let r">{{ r.termWeeks }} {{ getUnidad(r.frequency) }}</td>
                      </ng-container>
                      <ng-container matColumnDef="estatus">
                        <th mat-header-cell *matHeaderCellDef>Estatus</th>
                        <td mat-cell *matCellDef="let r">
                          <span class="badge badge-{{ r.status | lowercase }}">{{ r.status }}</span>
                        </td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="historyCols"></tr>
                      <tr mat-row *matRowDef="let row; columns: historyCols;"></tr>
                    </table>
                  </div>
                } @else {
                  <div class="alert-box info" style="margin:12px 0">
                    <mat-icon>info</mat-icon>
                    <span>Cliente sin historial de créditos previos.</span>
                  </div>
                }
              }

              <mat-divider style="margin:16px 0"></mat-divider>
              <h3 class="section-title">Condiciones del crédito</h3>

              <div class="form-grid">
                <!-- Tipo -->
                <mat-form-field appearance="outline">
                  <mat-label>Tipo de crédito *</mat-label>
                  <mat-select formControlName="loanTypeId" (selectionChange)="onTypeChange()">
                    @for (t of loanTypes(); track t.id) {
                      <mat-option [value]="t.id">{{ t.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <!-- Monto -->
                <mat-form-field appearance="outline">
                  <mat-label>Monto solicitado *</mat-label>
                  <input matInput type="number" formControlName="principalAmount"
                         (change)="onAmountChange()">
                  <span matPrefix>$&nbsp;</span>
                  @if (currentRange()) {
                    <mat-hint>
                      Tasa: {{ (currentRange()!.totalRate * 100).toFixed(0) }}% total
                    </mat-hint>
                  }
                </mat-form-field>

                <!-- Período — solo los disponibles según el rango -->
                <mat-form-field appearance="outline">
                  <mat-label>Plazo ({{ unidadActual() }}) *</mat-label>
                  @if (periodsAvailable().length > 0) {
                    <mat-select formControlName="termWeeks" (selectionChange)="simulate()">
                      @for (p of periodsAvailable(); track p) {
                        <mat-option [value]="p">{{ p }} {{ unidadActual() }}</mat-option>
                      }
                    </mat-select>
                  } @else {
                    <input matInput type="number" formControlName="termWeeks"
                           (change)="simulate()">
                  }
                  @if (periodsAvailable().length === 0 && form.value.loanTypeId && form.value.principalAmount) {
                    <mat-hint style="color:#DC2626">
                      Sin rangos configurados para este monto
                    </mat-hint>
                  }
                </mat-form-field>
              </div>

              <!-- PREVIEW SIMULACIÓN -->
              @if (simResult()) {
                <div class="sim-preview">
                  <div class="sim-item">
                    <span>Cuota {{ unidadActual() === 'días' ? 'diaria' : unidadActual() }}</span>
                    <strong>{{ simResult()!.periodicPayment | currency:'MXN' }}</strong>
                  </div>
                  <div class="sim-item">
                    <span>Total a pagar</span>
                    <strong>{{ simResult()!.totalPayment | currency:'MXN' }}</strong>
                  </div>
                  <div class="sim-item">
                    <span>Total intereses</span>
                    <strong style="color:#DC2626">{{ simResult()!.totalInterest | currency:'MXN' }}</strong>
                  </div>
                  <button mat-stroked-button type="button" (click)="downloadSimPdf()"
                          [disabled]="downloadingPdf()">
                    @if (downloadingPdf()) { <mat-spinner diameter="16"></mat-spinner> }
                    @else { <mat-icon>picture_as_pdf</mat-icon> }
                    Plan de pagos PDF
                  </button>
                </div>
              }

              <mat-form-field appearance="outline" class="w-full" style="margin-top:16px">
                <mat-label>Observaciones</mat-label>
                <textarea matInput formControlName="notes" rows="2"></textarea>
              </mat-form-field>

              <div class="form-actions">
                <a mat-stroked-button routerLink="/loans">Cancelar</a>
                <button mat-raised-button color="primary" type="submit"
                        [disabled]="form.invalid || !selectedCustomer() || saving()">
                  @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                  @else { <mat-icon>send</mat-icon> }
                  Crear solicitud
                </button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>
      </mat-step>

      <!-- PASO 2: AVAL -->
      <mat-step label="Datos del aval" [completed]="avalSaved()">
        <mat-card>
          <mat-card-header>
            <mat-card-title><mat-icon>people</mat-icon> Registro del aval</mat-card-title>
            <mat-card-subtitle>Requerido para toda solicitud</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (!createdLoan()) {
              <div class="alert-box warning">
                <mat-icon>warning</mat-icon>
                <span>Primero completa el paso 1.</span>
              </div>
            } @else {
              <form [formGroup]="avalForm" (ngSubmit)="saveAval()">
                <div class="form-grid">
                  <mat-form-field appearance="outline" class="col-span-2">
                    <mat-label>Nombre completo *</mat-label>
                    <input matInput formControlName="fullName">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>CURP *</mat-label>
                    <input matInput formControlName="curp" style="text-transform:uppercase">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>RFC</mat-label>
                    <input matInput formControlName="rfc" style="text-transform:uppercase">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Teléfono *</mat-label>
                    <input matInput formControlName="phone" maxlength="10">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Parentesco</mat-label>
                    <mat-select formControlName="relationship">
                      <mat-option value="Cónyuge">Cónyuge</mat-option>
                      <mat-option value="Padre/Madre">Padre / Madre</mat-option>
                      <mat-option value="Hijo/Hija">Hijo / Hija</mat-option>
                      <mat-option value="Hermano/Hermana">Hermano / Hermana</mat-option>
                      <mat-option value="Amigo">Amigo</mat-option>
                      <mat-option value="Otro">Otro</mat-option>
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="col-span-2">
                    <mat-label>Domicilio completo</mat-label>
                    <textarea matInput formControlName="address" rows="2"
                      placeholder="Calle, número, colonia, municipio, estado, CP"></textarea>
                  </mat-form-field>
                </div>
                <div class="form-actions">
                  <button mat-stroked-button type="button" matStepperPrevious>Anterior</button>
                  <button mat-raised-button color="primary" type="submit"
                          [disabled]="avalForm.invalid || savingAval()">
                    @if (savingAval()) { <mat-spinner diameter="20"></mat-spinner> }
                    @else { <mat-icon>save</mat-icon> }
                    {{ avalSaved() ? 'Actualizar aval' : 'Registrar aval' }}
                  </button>
                  @if (avalSaved()) {
                    <button mat-raised-button color="accent" type="button" matStepperNext>
                      Continuar <mat-icon>arrow_forward</mat-icon>
                    </button>
                  }
                </div>
              </form>
            }
          </mat-card-content>
        </mat-card>
      </mat-step>

      <!-- PASO 3 -->
      <mat-step label="Resumen">
        <mat-card>
          <mat-card-header><mat-card-title>Solicitud enviada</mat-card-title></mat-card-header>
          <mat-card-content>
            @if (createdLoan()) {
              <div class="alert-box success" style="margin-bottom:16px">
                <mat-icon>check_circle</mat-icon>
                <span>Solicitud <strong>{{ createdLoan()!.id.substring(0,8).toUpperCase() }}</strong> creada.</span>
              </div>
              <div class="summary-actions">
                <button mat-raised-button color="primary" (click)="downloadSimPdf()">
                  <mat-icon>picture_as_pdf</mat-icon> Plan de pagos
                </button>
                <a mat-stroked-button [routerLink]="['/loans', createdLoan()!.id]">
                  <mat-icon>visibility</mat-icon> Ver detalle
                </a>
                <a mat-stroked-button routerLink="/loans">
                  <mat-icon>list</mat-icon> Volver
                </a>
              </div>
            }
          </mat-card-content>
        </mat-card>
      </mat-step>

    </mat-stepper>
  `,
})
export class LoanFormComponent implements OnInit {
  private api      = inject(ApiService);
  private fb       = inject(FormBuilder);
  private router   = inject(Router);
  private snackbar = inject(MatSnackBar);
  private pdfSvc   = inject(PdfDownloadService);

  customers        = signal<Customer[]>([]);
  loanTypes        = signal<LoanType[]>([]);
  customerLoans    = signal<Loan[]>([]);
  selectedCustomer = signal<Customer | null>(null);
  selectedType     = signal<LoanType | null>(null);
  currentRange     = signal<any>(null);      // rango de tasa actual
  periodsAvailable = signal<number[]>([]);   // períodos del rango
  simResult        = signal<any>(null);
  createdLoan      = signal<Loan | null>(null);
  saving           = signal(false);
  savingAval       = signal(false);
  avalSaved        = signal(false);
  downloadingPdf   = signal(false);
  loadingHistory   = signal(false);
  customerSearch   = signal('');
  unidadActual     = signal('días');
  historyCols = ['fecha', 'monto', 'plazo', 'estatus'];

  private searchSubject = new Subject<string>();

  form = this.fb.group({
    loanTypeId:      ['', Validators.required],
    frequency:       ['DIARIO', Validators.required],
    principalAmount: [null as number | null, [Validators.required, Validators.min(1)]],
    termWeeks:       [null as number | null, [Validators.required, Validators.min(1)]],
    notes:           [''],
  });

  avalForm = this.fb.group({
    fullName:     ['', Validators.required],
    curp:         ['', Validators.required],
    rfc:          [''],
    phone:        ['', Validators.required],
    relationship: [''],
    address:      [''],
  });

  ngOnInit() {
    this.api.get<any>('/settings/loan-types').subscribe({
      next: (r) => {
        const list = Array.isArray(r) ? r : r?.data ?? [];
        this.loanTypes.set(list);
      },
    });
    this.searchSubject.pipe(debounceTime(350), distinctUntilChanged()).subscribe((term) => {
      if (!term || term.length < 2) { this.customers.set([]); return; }
      this.api.get<any>('/customers', { search: term, limit: 5 }).subscribe({
        next: (r) => {
          const data = Array.isArray(r) ? r : r?.data ?? [];
          this.customers.set(data);
        },
      });
    });
  }

  getUnidad(freq: string): string { return unidadPlazo(freq); }

  onCustomerSearch(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.customerSearch.set(term);
    this.searchSubject.next(term);
  }

  selectCustomer(c: Customer) {
    this.selectedCustomer.set(c);
    this.customerSearch.set(c.fullName);
    this.loadingHistory.set(true);
    this.api.get<any>('/loans', { customerId: c.id, limit: 10 }).subscribe({
      next: (r) => { this.customerLoans.set(r?.data ?? []); this.loadingHistory.set(false); },
      error: () => this.loadingHistory.set(false),
    });
  }

  clearCustomer() {
    this.selectedCustomer.set(null);
    this.customerSearch.set('');
    this.customerLoans.set([]);
  }

  onTypeChange() {
    const type = this.loanTypes().find((t) => t.id === this.form.value.loanTypeId);
    if (!type) return;
    this.selectedType.set(type);
    this.unidadActual.set(unidadPlazo(type.frequency));
    this.form.patchValue({ frequency: type.frequency, termWeeks: null });
    this.currentRange.set(null);
    this.periodsAvailable.set([]);
    this.simResult.set(null);
    // Si hay monto, cargar rango
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
          // Pre-seleccionar el período máximo
          if (periods.length > 0) {
            const maxP = Math.max(...periods);
            this.form.patchValue({ termWeeks: maxP });
            this.simulate();
          }
        } else {
          this.currentRange.set(null);
          this.periodsAvailable.set([]);
        }
      },
      error: () => { this.currentRange.set(null); this.periodsAvailable.set([]); },
    });
  }

  simulate() {
    const { principalAmount, termWeeks, frequency } = this.form.value;
    if (!principalAmount || !termWeeks) return;
    const range = this.currentRange();
    this.api.post<any>('/loans/simulate', {
      principalAmount,
      termWeeks,
      frequency,
      totalRate:    range ? range.totalRate : undefined,
      interestRate: range ? undefined : 0,
    }).subscribe({ next: (r) => this.simResult.set(r) });
  }

  downloadSimPdf() {
    const { principalAmount, termWeeks, frequency } = this.form.value;
    if (!principalAmount || !termWeeks) return;
    const range = this.currentRange();
    this.downloadingPdf.set(true);
    this.pdfSvc.downloadPost('/loans/simulate/pdf', 'plan-pagos.pdf', {
      principalAmount, termWeeks, frequency,
      totalRate:    range ? range.totalRate : undefined,
      interestRate: range ? undefined : 0,
      customerName: this.selectedCustomer()?.fullName,
    });
    setTimeout(() => this.downloadingPdf.set(false), 2000);
  }

  submit() {
    if (this.form.invalid || !this.selectedCustomer()) {
      this.form.markAllAsTouched(); return;
    }
    this.saving.set(true);
    const range = this.currentRange();
    this.api.post<Loan>('/loans', {
      ...this.form.value,
      customerId:  this.selectedCustomer()!.id,
      totalRate:   range ? range.totalRate : undefined,
      interestRate: range ? 0 : 0,
    }).subscribe({
      next: (loan) => {
        this.createdLoan.set(loan);
        this.snackbar.open('Solicitud creada. Registra el aval.', 'OK', { duration: 5000 });
        this.saving.set(false);
      },
      error: (err) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  saveAval() {
    if (this.avalForm.invalid || !this.createdLoan()) return;
    this.savingAval.set(true);
    this.api.post('/loans/' + this.createdLoan()!.id + '/guarantor', {
      ...this.avalForm.value,
      curp: (this.avalForm.value.curp || '').toUpperCase(),
      rfc:  (this.avalForm.value.rfc  || '').toUpperCase(),
    }).subscribe({
      next: () => { this.snackbar.open('Aval registrado', 'OK', { duration: 3000 }); this.avalSaved.set(true); this.savingAval.set(false); },
      error: (err: any) => { this.snackbar.open(err.error?.message?.[0] || 'Error', 'Cerrar', { duration: 5000 }); this.savingAval.set(false); },
    });
  }
}