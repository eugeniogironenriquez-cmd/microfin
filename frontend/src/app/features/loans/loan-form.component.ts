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
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ApiService, Customer, PagedResponse, Loan } from '../../core/index';
import { PdfDownloadService } from '../../core/pdf-download.service';

@Component({
  selector: 'app-loan-form',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatAutocompleteModule, MatDividerModule,
    MatStepperModule, MatTableModule, MatChipsModule, MatTooltipModule,
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
                        <td mat-cell *matCellDef="let r">{{ r.termWeeks }} días</td>
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

                <!-- COMPORTAMIENTO DE PAGO -->
                @if (comportamiento(); as comp) {
                  @if (comp.resumen.tieneProblemas) {
                    <div class="comportamiento-box">
                      <div class="comp-header">
                        <mat-icon style="color:#DC2626">warning</mat-icon>
                        <strong>Historial de problemas de pago</strong>
                      </div>
                      <div class="comp-stats">
                        <div class="comp-stat">
                          <span class="comp-num rojo">{{ comp.resumen.vecesRojo }}</span>
                          <span class="comp-lbl">veces en rojo</span>
                        </div>
                        <div class="comp-stat">
                          <span class="comp-num amarillo">{{ comp.resumen.vecesAmarillo }}</span>
                          <span class="comp-lbl">veces en amarillo</span>
                        </div>
                        <div class="comp-stat">
                          <span class="comp-num">{{ comp.resumen.maxCuotasVencidas }}</span>
                          <span class="comp-lbl">máx. cuotas vencidas</span>
                        </div>
                      </div>
                    </div>
                  } @else {
                    <div class="alert-box success" style="margin:12px 0">
                      <mat-icon>verified</mat-icon>
                      <span>Cliente sin problemas de pago registrados. Buen comportamiento.</span>
                    </div>
                  }
                }
              }

              <mat-divider style="margin:16px 0"></mat-divider>
              <h3 class="section-title">Condiciones del crédito</h3>

              <div class="form-grid">
                <!-- Monto -->
                <mat-form-field appearance="outline">
                  <mat-label>Monto solicitado *</mat-label>
                  <input matInput type="number" formControlName="principalAmount"
                         (change)="simulate()">
                  <span matPrefix>$&nbsp;</span>
                </mat-form-field>

                <!-- Plazo en días -->
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
                    <mat-hint>Tasa: {{ (selectedPlazo()!.percentage * 100).toFixed(0) }}%</mat-hint>
                  }
                </mat-form-field>
              </div>

              <!-- PREVIEW SIMULACIÓN + CUOTA AJUSTABLE -->
              @if (simResult()) {
                <div class="cuota-ajuste">
                  <div class="cuota-label">
                    <span>Cuota diaria (ajustable)</span>
                    <span class="min-hint">Mínimo: {{ minPayment() | currency:'MXN' }}</span>
                  </div>
                  <mat-form-field appearance="outline" class="cuota-field">
                    <input matInput type="number" step="1" [value]="cuotaActual()"
                           (input)="onCuotaInput($event)">
                    <span matPrefix>$&nbsp;</span>
                  </mat-form-field>
                  <button mat-stroked-button color="primary" type="button" (click)="recalcConCuota()">
                    <mat-icon>refresh</mat-icon> Aplicar
                  </button>
                </div>
                <div class="sim-preview">
                  <div class="sim-item">
                    <span>Cuota diaria</span>
                    <strong>{{ simResult()!.periodicPayment | currency:'MXN' }}</strong>
                  </div>
                  <div class="sim-item">
                    <span>Total a pagar</span>
                    <strong>{{ simResult()!.totalPayment | currency:'MXN' }}</strong>
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

      <!-- PASO 3: DOCUMENTOS -->
      <mat-step label="Documentos">
        <mat-card>
          <mat-card-header>
            <mat-card-title><mat-icon>folder_open</mat-icon> Documentos de garantía</mat-card-title>
            <mat-card-subtitle>Sube los documentos del cliente (opcional, puedes hacerlo después)</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (!createdLoan()) {
              <div class="alert-box warning">
                <mat-icon>warning</mat-icon>
                <span>Primero completa los pasos anteriores.</span>
              </div>
            } @else {
              <div class="garantia-section">
                <div class="garantia-header">
                  <mat-icon style="color:#1C4532;font-size:36px;width:36px;height:36px">home_work</mat-icon>
                  <div>
                    <h3 style="margin:0;font-size:16px;font-weight:700;color:#171923">Documento de garantía</h3>
                    <p style="margin:4px 0 0;font-size:13px;color:#718096">
                      Sube el documento que respalda el crédito: escritura de terreno, título de propiedad,
                      factura de vehículo, contrato u otro bien como garantía.
                    </p>
                  </div>
                </div>

                <mat-form-field appearance="outline" class="w-full" style="margin:16px 0">
                  <mat-label>Descripción del bien en garantía</mat-label>
                  <textarea matInput rows="2"
                            [value]="garantiaDesc()"
                            (input)="garantiaDesc.set($any($event.target).value)"
                            placeholder="Ej: Terreno ubicado en Calle Juárez #45, Col. Centro, Ixtepec, Oaxaca. Sup. 200m²">
                  </textarea>
                  <mat-hint>Describe brevemente el bien dado en garantía</mat-hint>
                </mat-form-field>

                @if (!uploadedDocs().has('garantia')) {
                  <div class="upload-zone" (click)="docFileInput.click()">
                    <mat-icon style="font-size:48px;width:48px;height:48px;color:#CBD5E0">cloud_upload</mat-icon>
                    <p style="margin:8px 0 4px;font-weight:600;color:#4A5568">Haz clic para seleccionar el archivo</p>
                    <p style="margin:0;font-size:12px;color:#718096">PDF, JPG, PNG — máximo 10 MB</p>
                    <input #docFileInput type="file" accept=".pdf,.jpg,.jpeg,.png"
                           style="display:none" (change)="uploadDoc('garantia', $event)">
                  </div>
                } @else {
                  <div class="upload-success">
                    <mat-icon style="color:#16A34A;font-size:32px;width:32px;height:32px">check_circle</mat-icon>
                    <div>
                      <div style="font-weight:700;color:#16A34A">Documento subido correctamente</div>
                      <div style="font-size:12px;color:#718096">{{ uploadedFileName() }}</div>
                    </div>
                    <button mat-icon-button (click)="docFileInput2.click()" matTooltip="Reemplazar documento">
                      <mat-icon>swap_horiz</mat-icon>
                    </button>
                    <input #docFileInput2 type="file" accept=".pdf,.jpg,.jpeg,.png"
                           style="display:none" (change)="uploadDoc('garantia', $event)">
                  </div>
                }

                @if (uploadingDoc() === 'garantia') {
                  <div style="display:flex;align-items:center;gap:8px;margin-top:12px;color:#718096">
                    <mat-spinner diameter="20"></mat-spinner>
                    <span>Subiendo documento...</span>
                  </div>
                }
              </div>

              <div class="form-actions" style="margin-top:20px">
                <button mat-stroked-button type="button" matStepperPrevious>Anterior</button>
                <button mat-raised-button color="accent" type="button" matStepperNext>
                  Continuar <mat-icon>arrow_forward</mat-icon>
                </button>
              </div>
            }
          </mat-card-content>
        </mat-card>
      </mat-step>

      <!-- PASO 4: RESUMEN -->
      <mat-step label="Resumen">
        <mat-card>
          <mat-card-header><mat-card-title>Solicitud completada</mat-card-title></mat-card-header>
          <mat-card-content>
            @if (createdLoan()) {
              <div class="alert-box success" style="margin-bottom:16px">
                <mat-icon>check_circle</mat-icon>
                <span>Solicitud <strong>{{ createdLoan()!.id.substring(0,8).toUpperCase() }}</strong> creada.</span>
              </div>
              @if (uploadedDocs().size > 0) {
                <div class="alert-box info" style="margin-bottom:16px">
                  <mat-icon>folder_open</mat-icon>
                  <span>{{ uploadedDocs().size }} documento(s) adjunto(s) correctamente.</span>
                </div>
              }
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
  styles: [`
    .comportamiento-box {
      background:#FEF2F2; border:1px solid #FECACA; border-radius:10px;
      padding:14px; margin:12px 0;
    }
    .comp-header { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
    .comp-header strong { color:#991B1B; }
    .comp-stats { display:flex; gap:20px; }
    .comp-stat { display:flex; flex-direction:column; align-items:center; }
    .comp-num { font-size:24px; font-weight:700; line-height:1; }
    .comp-num.rojo { color:#DC2626; }
    .comp-num.amarillo { color:#D97706; }
    .comp-lbl { font-size:11px; color:#718096; margin-top:2px; text-align:center; }
    .cuota-ajuste {
      display:flex; align-items:center; gap:12px; flex-wrap:wrap;
      background:#F7FAFC; border-radius:10px; padding:12px 14px; margin:12px 0;
    }
    .cuota-ajuste .cuota-label { display:flex; flex-direction:column; font-size:13px; font-weight:600; }
    .cuota-ajuste .min-hint { font-size:11px; color:#718096; font-weight:400; }
    .cuota-ajuste .cuota-field { width:140px; margin-bottom:-1.25em; }
  `],
})
export class LoanFormComponent implements OnInit {
  private api      = inject(ApiService);
  private http     = inject(HttpClient);
  private fb       = inject(FormBuilder);
  private router   = inject(Router);
  private snackbar = inject(MatSnackBar);
  private pdfSvc   = inject(PdfDownloadService);

  customers        = signal<Customer[]>([]);
  plazos           = signal<any[]>([]);
  selectedPlazo    = signal<any>(null);
  customerLoans    = signal<Loan[]>([]);
  comportamiento   = signal<any>(null);
  selectedCustomer = signal<Customer | null>(null);
  simResult        = signal<any>(null);
  minPayment       = signal<number>(0);
  cuotaActual      = signal<number>(0);
  createdLoan      = signal<Loan | null>(null);
  saving           = signal(false);
  savingAval       = signal(false);
  avalSaved        = signal(false);
  downloadingPdf   = signal(false);
  loadingHistory   = signal(false);
  customerSearch   = signal('');
  historyCols  = ['fecha', 'monto', 'plazo', 'estatus'];
  uploadedDocs = signal<Set<string>>(new Set());
  uploadingDoc = signal<string | null>(null);

  garantiaDesc     = signal('');
  uploadedFileName = signal('');

  private searchSubject = new Subject<string>();

  form = this.fb.group({
    principalAmount: [null as number | null, [Validators.required, Validators.min(1)]],
    days:            [null as number | null, [Validators.required, Validators.min(1)]],
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
    this.api.get<any>('/plazos-credito').subscribe({
      next: (r) => {
        const list = Array.isArray(r) ? r : r?.data ?? [];
        this.plazos.set(list);
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

  onCustomerSearch(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.customerSearch.set(term);
    this.searchSubject.next(term);
  }

  selectCustomer(c: Customer) {
    this.selectedCustomer.set(c);
    this.customerSearch.set(c.fullName);
    this.comportamiento.set(null);
    this.loadingHistory.set(true);
    this.api.get<any>('/loans', { customerId: c.id, limit: 10 }).subscribe({
      next: (r) => { this.customerLoans.set(r?.data ?? []); this.loadingHistory.set(false); },
      error: () => this.loadingHistory.set(false),
    });
    // Comportamiento de pago (historial de semáforo)
    this.api.get<any>(`/semaforo/historial/${c.id}`).subscribe({
      next: (h) => this.comportamiento.set(h),
      error: () => this.comportamiento.set(null),
    });
  }

  clearCustomer() {
    this.selectedCustomer.set(null);
    this.customerSearch.set('');
    this.customerLoans.set([]);
    this.comportamiento.set(null);
  }

  onPlazoChange() {
    const p = this.plazos().find(x => x.days === this.form.value.days);
    this.selectedPlazo.set(p || null);
    this.simulate();
  }

  simulate() {
    const { principalAmount, days } = this.form.value;
    if (!principalAmount || !days) return;
    this.api.post<any>('/loans/simulate', {
      principalAmount, days,
    }).subscribe({ next: (r) => {
      this.simResult.set(r);
      this.minPayment.set(r.minPayment ?? r.periodicPayment);
      this.cuotaActual.set(r.periodicPayment);
    } });
  }

  onCuotaInput(event: Event) {
    this.cuotaActual.set(Number((event.target as HTMLInputElement).value));
  }

  recalcConCuota() {
    const { principalAmount, days } = this.form.value;
    const cuota = Number(this.cuotaActual());
    if (!principalAmount || !days) return;
    if (cuota < this.minPayment()) {
      this.snackbar.open(`La cuota no puede ser menor a ${this.minPayment()}`, 'Cerrar', { duration: 4000 });
      return;
    }
    this.api.post<any>('/loans/simulate', {
      principalAmount, days, customPayment: cuota,
    }).subscribe({
      next: (r) => { this.simResult.set(r); this.minPayment.set(r.minPayment ?? r.periodicPayment); },
      error: (err) => this.snackbar.open(err.error?.message || 'Error al recalcular', 'Cerrar', { duration: 4000 }),
    });
  }

  downloadSimPdf() {
    const { principalAmount, days } = this.form.value;
    if (!principalAmount || !days) return;
    this.downloadingPdf.set(true);
    const cuota = Number(this.cuotaActual());
    this.pdfSvc.downloadPost('/loans/simulate/pdf', 'plan-pagos.pdf', {
      principalAmount, days,
      customPayment: cuota > this.minPayment() ? cuota : undefined,
      customerName: this.selectedCustomer()?.fullName,
    });
    setTimeout(() => this.downloadingPdf.set(false), 2000);
  }

  submit() {
    if (this.form.invalid || !this.selectedCustomer()) {
      this.form.markAllAsTouched(); return;
    }
    this.saving.set(true);
    const cuota = Number(this.cuotaActual());
    this.api.post<Loan>('/loans', {
      principalAmount: this.form.value.principalAmount,
      days:            this.form.value.days,
      customPayment:   cuota > this.minPayment() ? cuota : undefined,
      notes:           this.form.value.notes,
      customerId:      this.selectedCustomer()!.id,
    }).subscribe({
      next: (loan) => {
        this.createdLoan.set(loan);
        this.snackbar.open('Solicitud creada. Registra el aval.', 'OK', { duration: 5000 });
        this.saving.set(false);
      },
      error: (err) => {
        this.snackbar.open(err.error?.message?.[0] || err.error?.message || 'Error', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  uploadDoc(docType: string, event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    const loanId = this.createdLoan()?.id;
    if (!file || !loanId) return;

    this.uploadingDoc.set(docType);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', docType);
    formData.append('fileName', file.name);
    if (this.garantiaDesc()) formData.append('description', this.garantiaDesc());

    const token = localStorage.getItem('access_token');
    this.http.post(
      `/api/v1/loans/${loanId}/documents`,
      formData,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    ).subscribe({
      next: () => {
        const set = new Set(this.uploadedDocs());
        set.add(docType);
        this.uploadedDocs.set(set);
        this.uploadedFileName.set(file.name);
        this.uploadingDoc.set(null);
        this.snackbar.open('Documento de garantía subido', 'OK', { duration: 2000 });
      },
      error: () => {
        this.uploadingDoc.set(null);
        this.snackbar.open('Error al subir el documento', 'Cerrar', { duration: 4000 });
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
      error: (err: any) => { this.snackbar.open(err.error?.message?.[0] || err.error?.message || 'Error', 'Cerrar', { duration: 5000 }); this.savingAval.set(false); },
    });
  }
}