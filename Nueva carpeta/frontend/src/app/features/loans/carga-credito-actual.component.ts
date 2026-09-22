import { Component, OnInit, inject, signal, computed } from '@angular/core';
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { ApiService, Customer, Loan } from '../../core/index';

@Component({
  selector: 'app-carga-credito-actual',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatAutocompleteModule, MatDividerModule,
    MatCheckboxModule, MatTableModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>upload_file</mat-icon> Cargar crédito actual</h1>
      <a mat-stroked-button routerLink="/loans"><mat-icon>arrow_back</mat-icon> Préstamos</a>
    </div>

    <div class="alert-box info" style="margin-bottom:16px">
      <mat-icon>info</mat-icon>
      <span>Esta pantalla es para registrar créditos que ya están en la calle. El crédito nace ACTIVO,
            se genera su calendario y puedes marcar qué cuotas ya pagó el cliente (aunque haya saltado días).</span>
    </div>

    <mat-card>
      <mat-card-content>
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

          @if (creditoVigente(); as cv) {
            <div class="credito-vigente-box">
              <mat-icon style="color:#DC2626">block</mat-icon>
              <div>
                <strong>Este cliente ya tiene un crédito vigente</strong>
                <p>Folio {{ cv.id.substring(0,8).toUpperCase() }} ·
                   {{ cv.principalAmount | currency:'MXN' }} ·
                   <span class="badge badge-{{ cv.status | lowercase }}">{{ cv.status }}</span></p>
                <p class="cv-hint">No se puede cargar otro hasta que el actual sea liquidado.</p>
              </div>
            </div>
          }
        }

        @if (selectedCustomer() && !creditoVigente()) {
          <mat-divider style="margin:16px 0"></mat-divider>

          <!-- DATOS DEL CRÉDITO -->
          <h3 class="section-title">Datos del crédito</h3>
          <form [formGroup]="form">
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Monto del crédito *</mat-label>
                <input matInput type="number" formControlName="principalAmount">
                <span matPrefix>$&nbsp;</span>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Plazo (días) *</mat-label>
                <input matInput type="number" formControlName="days">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Cuota diaria *</mat-label>
                <input matInput type="number" formControlName="periodicPayment">
                <span matPrefix>$&nbsp;</span>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Fecha de desembolso</mat-label>
                <input matInput type="date" formControlName="disbursedAt">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Fecha del primer pago *</mat-label>
                <input matInput type="date" formControlName="firstPaymentDate">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Mora que arrastra (opcional)</mat-label>
                <input matInput type="number" formControlName="totalMoratorio">
                <span matPrefix>$&nbsp;</span>
                <mat-hint>Mora del sistema anterior, si la tiene</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Fecha del último pago (opcional)</mat-label>
                <input matInput type="date" formControlName="fechaUltimoPago">
              </mat-form-field>
            </div>

            <button mat-stroked-button color="primary" type="button" (click)="generarCalendario()">
              <mat-icon>event</mat-icon> Generar calendario
            </button>
          </form>

          <!-- CALENDARIO CON CASILLAS -->
          @if (calendario().length > 0) {
            <div class="cal-section">
              <div class="cal-header">
                <h3 class="section-title" style="margin:0">Calendario — marca las cuotas ya pagadas</h3>
                <div class="cal-summary">
                  <span><strong>{{ seleccionadas().size }}</strong> de {{ calendario().length }} pagadas</span>
                  <span class="cal-total">Pagado: {{ montoPagado() | currency:'MXN' }}</span>
                </div>
              </div>
              <div class="cal-actions">
                <button mat-button type="button" (click)="marcarHasta()">
                  <mat-icon>playlist_add_check</mat-icon> Marcar las primeras N
                </button>
                <button mat-button type="button" (click)="limpiarMarcas()">
                  <mat-icon>clear</mat-icon> Limpiar
                </button>
              </div>

              <div class="cal-grid">
                @for (c of calendario(); track c.period) {
                  <div class="cal-cell" [class.marcada]="seleccionadas().has(c.period)"
                       [class.vencida]="esVencida(c)"
                       (click)="toggleCuota(c.period)">
                    <mat-checkbox [checked]="seleccionadas().has(c.period)"
                                  (click)="$event.stopPropagation(); toggleCuota(c.period)"
                                  color="primary"></mat-checkbox>
                    <div class="cal-info">
                      <span class="cal-num">Cuota {{ c.period }}</span>
                      <span class="cal-date">{{ c.dueDate | date:'EEE dd/MM/yy':'UTC' }}</span>
                    </div>
                    @if (esVencida(c) && !seleccionadas().has(c.period)) {
                      <span class="cal-venc">vencida</span>
                    }
                  </div>
                }
              </div>
            </div>

            <!-- AVAL -->
            <mat-divider style="margin:20px 0"></mat-divider>
            <h3 class="section-title">Datos del aval (opcional)</h3>
            <form [formGroup]="avalForm">
              <div class="form-grid">
                <mat-form-field appearance="outline" class="col-span-2">
                  <mat-label>Nombre completo</mat-label>
                  <input matInput formControlName="fullName">
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>CURP</mat-label>
                  <input matInput formControlName="curp" style="text-transform:uppercase">
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Teléfono</mat-label>
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
                  <mat-label>Domicilio</mat-label>
                  <textarea matInput formControlName="address" rows="2"></textarea>
                </mat-form-field>
              </div>
            </form>

            <div class="form-actions">
              <a mat-stroked-button routerLink="/loans">Cancelar</a>
              <button mat-raised-button color="primary" type="button" (click)="cargar()"
                      [disabled]="saving()">
                @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                @else { <mat-icon>save</mat-icon> }
                Cargar crédito
              </button>
            </div>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .w-full { width:100%; }
    .section-title { font-size:15px; font-weight:700; color:#1C4532; margin:8px 0 12px; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .form-grid .col-span-2 { grid-column:span 2; }
    @media(max-width:700px){ .form-grid { grid-template-columns:1fr; } .form-grid .col-span-2 { grid-column:span 1; } }
    .form-actions { display:flex; justify-content:flex-end; gap:12px; margin-top:20px; }
    .customer-selected {
      display:flex; align-items:center; gap:10px; padding:10px 14px;
      background:#F0FFF4; border:1px solid #BBF7D0; border-radius:10px; margin:8px 0;
    }
    .customer-selected .text-muted { color:#718096; font-size:13px; }
    .credito-vigente-box {
      display:flex; align-items:flex-start; gap:12px;
      background:#FEF2F2; border:1px solid #FECACA; border-radius:10px;
      padding:14px; margin:12px 0;
    }
    .credito-vigente-box strong { color:#991B1B; display:block; margin-bottom:4px; }
    .credito-vigente-box p { margin:2px 0; font-size:13px; color:#7F1D1D; }
    .credito-vigente-box .cv-hint { font-size:12px; color:#B91C1C; font-style:italic; }
    .cal-section { margin-top:20px; }
    .cal-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
    .cal-summary { display:flex; gap:16px; font-size:13px; color:#4A5568; }
    .cal-summary .cal-total { font-weight:700; color:#1C4532; }
    .cal-actions { display:flex; gap:8px; margin:8px 0; }
    .cal-grid {
      display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));
      gap:8px; margin-top:8px;
    }
    .cal-cell {
      display:flex; align-items:center; gap:8px; padding:8px 10px;
      border:1px solid #E2E8F0; border-radius:8px; cursor:pointer; transition:.12s;
    }
    .cal-cell:hover { border-color:#1C4532; }
    .cal-cell.marcada { background:#F0FFF4; border-color:#16A34A; }
    .cal-cell.vencida { background:#FFF5F5; border-color:#FECACA; }
    .cal-cell.vencida.marcada { background:#F0FFF4; border-color:#16A34A; }
    .cal-info { display:flex; flex-direction:column; flex:1; }
    .cal-num { font-weight:600; font-size:13px; }
    .cal-date { font-size:11px; color:#718096; }
    .cal-venc { font-size:10px; color:#DC2626; font-weight:600; }
  `],
})
export class CargaCreditoActualComponent implements OnInit {
  private api      = inject(ApiService);
  private fb       = inject(FormBuilder);
  private router   = inject(Router);
  private snackbar = inject(MatSnackBar);

  customers        = signal<Customer[]>([]);
  selectedCustomer = signal<Customer | null>(null);
  creditoVigente   = signal<Loan | null>(null);
  customerSearch   = signal('');
  calendario       = signal<Array<{ period: number; dueDate: Date }>>([]);
  seleccionadas    = signal<Set<number>>(new Set());
  saving           = signal(false);

  private searchSubject = new Subject<string>();

  form = this.fb.group({
    principalAmount:  [null as number | null, [Validators.required, Validators.min(1)]],
    days:             [null as number | null, [Validators.required, Validators.min(1)]],
    periodicPayment:  [null as number | null, [Validators.required, Validators.min(0.01)]],
    disbursedAt:      [''],
    firstPaymentDate: ['', Validators.required],
    totalMoratorio:   [null as number | null],
    fechaUltimoPago:  [''],
  });

  avalForm = this.fb.group({
    fullName:     [''],
    curp:         [''],
    phone:        [''],
    relationship: [''],
    address:      [''],
  });

  montoPagado = computed(() => {
    const cuota = Number(this.form.value.periodicPayment) || 0;
    return Math.round(this.seleccionadas().size * cuota * 100) / 100;
  });

  ngOnInit() {
    this.searchSubject.pipe(debounceTime(350), distinctUntilChanged()).subscribe((term) => {
      if (!term || term.length < 2) { this.customers.set([]); return; }
      this.api.get<any>('/customers', { search: term, limit: 5 }).subscribe({
        next: (r) => this.customers.set(Array.isArray(r) ? r : r?.data ?? []),
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
    this.creditoVigente.set(null);
    this.api.get<any>('/loans', { customerId: c.id, limit: 10 }).subscribe({
      next: (r) => {
        const loans: Loan[] = r?.data ?? [];
        const bloqueantes = ['SOLICITUD', 'AUTORIZADO', 'ACTIVO', 'VENCIDO'];
        this.creditoVigente.set(loans.find((l) => bloqueantes.includes(l.status)) || null);
      },
    });
  }

  clearCustomer() {
    this.selectedCustomer.set(null);
    this.customerSearch.set('');
    this.creditoVigente.set(null);
    this.calendario.set([]);
    this.seleccionadas.set(new Set());
  }

  // ── Generación del calendario (réplica de la lógica del backend) ──
  // Días hábiles L-V anclados a medianoche UTC, empezando en la fecha de primer
  // pago (si cae fin de semana, se mueve al siguiente hábil).
  private isWeekend(d: Date): boolean {
    const w = d.getUTCDay();
    return w === 0 || w === 6;
  }
  private nextBusinessDay(d: Date): Date {
    const r = new Date(d);
    r.setUTCHours(0, 0, 0, 0);
    do { r.setUTCDate(r.getUTCDate() + 1); } while (this.isWeekend(r));
    return r;
  }

  // Convierte el valor del input date (puede venir como string 'yyyy-mm-dd'
  // o como objeto Date) a una fecha anclada a medianoche UTC.
  private parseFechaInput(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) {
      return new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate(), 0, 0, 0, 0));
    }
    const s = String(val).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0));
  }

  generarCalendario() {
    const v = this.form.value;
    const dias = Math.round(Number(v.days));
    const start = this.parseFechaInput(v.firstPaymentDate);
    if (!dias || !start) {
      this.snackbar.open('Revisa el plazo y la fecha del primer pago', 'Cerrar', { duration: 4000 });
      return;
    }

    let cursor = new Date(start);
    if (this.isWeekend(cursor)) cursor = this.nextBusinessDay(cursor);

    const cal: Array<{ period: number; dueDate: Date }> = [];
    for (let i = 1; i <= dias; i++) {
      cal.push({ period: i, dueDate: new Date(cursor) });
      if (i < dias) cursor = this.nextBusinessDay(cursor);
    }
    this.calendario.set(cal);
    this.seleccionadas.set(new Set());
  }

  esVencida(c: { dueDate: Date }): boolean {
    const MX = 6 * 60 * 60 * 1000;
    const hoy = new Date(Date.now() - MX);
    const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
    const dueUTC = Date.UTC(c.dueDate.getUTCFullYear(), c.dueDate.getUTCMonth(), c.dueDate.getUTCDate());
    return dueUTC < hoyUTC;
  }

  toggleCuota(period: number) {
    const set = new Set(this.seleccionadas());
    if (set.has(period)) set.delete(period);
    else set.add(period);
    this.seleccionadas.set(set);
  }

  marcarHasta() {
    const n = Number(prompt('¿Cuántas cuotas marcar como pagadas (las primeras N)?'));
    if (!n || n <= 0) return;
    const set = new Set<number>();
    for (let i = 1; i <= Math.min(n, this.calendario().length); i++) set.add(i);
    this.seleccionadas.set(set);
  }

  limpiarMarcas() {
    this.seleccionadas.set(new Set());
  }

  cargar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.calendario().length === 0) {
      this.snackbar.open('Genera el calendario primero', 'Cerrar', { duration: 4000 });
      return;
    }
    const v = this.form.value;
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const fmtInput = (val: any): string | undefined => {
      const d = this.parseFechaInput(val);
      return d ? fmt(d) : undefined;
    };

    const body: any = {
      customerId:       this.selectedCustomer()!.id,
      principalAmount:  Number(v.principalAmount),
      days:             Number(v.days),
      periodicPayment:  Number(v.periodicPayment),
      disbursedAt:      fmtInput(v.disbursedAt),
      firstPaymentDate: fmtInput(v.firstPaymentDate),
      schedule:         this.calendario().map((c) => ({ period: c.period, dueDate: fmt(c.dueDate) })),
      periodosPagados:  Array.from(this.seleccionadas()).sort((a, b) => a - b),
      fechaUltimoPago:  fmtInput(v.fechaUltimoPago),
      totalMoratorio:   Number(v.totalMoratorio) || 0,
    };

    const av = this.avalForm.value;
    if (av.fullName && av.curp) {
      body.aval = {
        fullName: av.fullName,
        curp: (av.curp || '').toUpperCase(),
        phone: av.phone || undefined,
        relationship: av.relationship || undefined,
        address: av.address || undefined,
      };
    }

    this.saving.set(true);
    this.api.post<any>('/loans/carga-manual', body).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.snackbar.open('Crédito cargado correctamente', 'OK', { duration: 4000 });
        const id = r?.loan?.id;
        if (id) this.router.navigate(['/loans', id]);
        else this.router.navigate(['/loans']);
      },
      error: (err) => {
        this.saving.set(false);
        this.snackbar.open(err.error?.message?.[0] || err.error?.message || 'Error al cargar el crédito', 'Cerrar', { duration: 5000 });
      },
    });
  }
}
