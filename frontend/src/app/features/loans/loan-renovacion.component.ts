import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-loan-renovacion',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatButtonToggleModule, MatIconModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatDividerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>autorenew</mat-icon> Renovación de crédito</h1>
      <a mat-stroked-button routerLink="/loans"><mat-icon>arrow_back</mat-icon> Préstamos</a>
    </div>

    @if (loading()) {
      <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
    } @else if (info()) {
      <div class="renovacion-layout">

        <!-- Historial del crédito anterior -->
        <mat-card>
          <mat-card-header><mat-card-title>Crédito anterior</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="info-rows">
              <div class="info-row"><span>Cliente</span><strong>{{ info()!.customer.fullName }}</strong></div>
              <div class="info-row"><span>CURP</span><strong class="mono">{{ info()!.customer.curp }}</strong></div>
              <div class="info-row"><span>Monto anterior</span><strong>{{ info()!.prevLoan.principalAmount | currency:'MXN' }}</strong></div>
              <div class="info-row"><span>Plazo</span><strong>{{ info()!.prevLoan.termWeeks }} días</strong></div>
              <div class="info-row"><span>Estado</span>
                <span class="badge badge-{{ info()!.prevLoan.status | lowercase }}">{{ info()!.prevLoan.status }}</span>
              </div>
              @if (info()!.prevLoan.status !== 'LIQUIDADO' && info()!.prevLoan.saldoPendiente > 0) {
                <div class="info-row saldo-row">
                  <span>Saldo capital ({{ info()!.prevLoan.cuotasPendientes }} cuotas)</span>
                  <strong class="saldo-desc">{{ info()!.prevLoan.saldoCapital | currency:'MXN' }}</strong>
                </div>
                @if (info()!.prevLoan.moraPendiente > 0) {
                  <div class="info-row saldo-row">
                    <span>Mora pendiente</span>
                    <strong class="saldo-desc">{{ info()!.prevLoan.moraPendiente | currency:'MXN' }}</strong>
                  </div>
                }
                <div class="info-row saldo-row saldo-total-row">
                  <span>Total a liquidar</span>
                  <strong class="saldo-desc">{{ info()!.prevLoan.saldoPendiente | currency:'MXN' }}</strong>
                </div>
                <div class="saldo-aviso">
                  <mat-icon>info</mat-icon>
                  Este saldo (capital + mora) se liquidará con la renovación y se descontará del monto que reciba el cliente.
                </div>
              }
            </div>

            <mat-divider style="margin:14px 0"></mat-divider>

            <h4 class="sub-title"><mat-icon>history</mat-icon> Comportamiento de pago</h4>
            <div class="pago-stats">
              <div class="pago-stat">
                <span class="pago-num verde">{{ info()!.historialPago.pagadas }}</span>
                <span class="pago-lbl">cuotas pagadas</span>
              </div>
              <div class="pago-stat">
                <span class="pago-num">{{ info()!.historialPago.totalCuotas }}</span>
                <span class="pago-lbl">cuotas totales</span>
              </div>
            </div>

            @if (info()!.avalAnterior) {
              <mat-divider style="margin:14px 0"></mat-divider>
              <h4 class="sub-title"><mat-icon>people</mat-icon> Aval anterior</h4>
              <div class="info-rows">
                <div class="info-row"><span>Nombre</span><strong>{{ info()!.avalAnterior.fullName }}</strong></div>
                <div class="info-row"><span>Teléfono</span><strong>{{ info()!.avalAnterior.phone }}</strong></div>
              </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Formulario de renovación -->
        <mat-card>
          <mat-card-header><mat-card-title>Nuevo crédito</mat-card-title></mat-card-header>
          <mat-card-content>
            <form [formGroup]="form" (ngSubmit)="renovar()">
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Monto a autorizar *</mat-label>
                <input matInput type="number" formControlName="principalAmount" (change)="simulate()">
                <span matPrefix>$&nbsp;</span>
              </mat-form-field>

              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Plazo (días) *</mat-label>
                <mat-select formControlName="days" (selectionChange)="onPlazoChange()">
                  @for (p of plazos(); track p.id) {
                    <mat-option [value]="p.days">{{ p.days }} días — {{ (p.percentage * 100).toFixed(0) }}%</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              @if (sim()) {
                <!-- Cuota diaria ajustable (igual que al crear un crédito) -->
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
                  <div><span>Cuota diaria</span><strong>{{ sim()!.periodicPayment | currency:'MXN' }}</strong></div>
                  <div><span>Total a pagar</span><strong>{{ sim()!.totalPayment | currency:'MXN' }}</strong></div>
                  @if (saldoADescontar() > 0) {
                    <div class="sim-desc"><span>Monto solicitado</span><strong>{{ montoSolicitado() | currency:'MXN' }}</strong></div>
                    <div class="sim-desc"><span>− Saldo capital anterior</span><strong class="saldo-desc">{{ (info()!.prevLoan.saldoCapital || 0) | currency:'MXN' }}</strong></div>
                    @if ((info()!.prevLoan.moraPendiente || 0) > 0) {
                      <div class="sim-desc"><span>− Mora pendiente</span><strong class="saldo-desc">{{ info()!.prevLoan.moraPendiente | currency:'MXN' }}</strong></div>
                    }
                    <div class="sim-entrega"><span>Cliente recibe</span><strong>{{ montoEntregado() | currency:'MXN' }}</strong></div>
                  }
                </div>
              }

              <!-- Aval -->
              <label class="field-label">Aval para el nuevo crédito</label>
              <mat-button-toggle-group formControlName="avalMode" class="aval-toggle">
                <mat-button-toggle value="NINGUNO">Sin aval</mat-button-toggle>
                <mat-button-toggle value="REUSAR" [disabled]="!info()!.avalAnterior">Reusar anterior</mat-button-toggle>
                <mat-button-toggle value="NUEVO">Nuevo aval</mat-button-toggle>
              </mat-button-toggle-group>

              @if (form.value.avalMode === 'NUEVO') {
                <div formGroupName="aval" class="aval-fields">
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Nombre del aval *</mat-label>
                    <input matInput formControlName="fullName">
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>CURP *</mat-label>
                    <input matInput formControlName="curp" style="text-transform:uppercase">
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Teléfono *</mat-label>
                    <input matInput formControlName="phone" maxlength="10">
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Domicilio</mat-label>
                    <textarea matInput formControlName="address" rows="2"></textarea>
                  </mat-form-field>
                </div>
              }

              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Observaciones</mat-label>
                <textarea matInput formControlName="notes" rows="2"></textarea>
              </mat-form-field>

              @if (saldoADescontar() > 0 && montoSolicitado() > 0 && montoEntregado() <= 0) {
                <div class="saldo-aviso" style="margin-bottom:12px">
                  <mat-icon>warning</mat-icon>
                  El monto solicitado debe ser mayor al saldo pendiente que se liquida
                  ({{ saldoADescontar() | currency:'MXN' }}).
                </div>
              }

              <button mat-raised-button color="primary" type="submit" class="w-full"
                      [disabled]="form.invalid || saving() || (saldoADescontar() > 0 && montoEntregado() <= 0)">
                @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                @else { <mat-icon>autorenew</mat-icon> }
                Crear renovación (autorizada)
              </button>
            </form>
          </mat-card-content>
        </mat-card>
      </div>
    }
  `,
  styles: [`
    .renovacion-layout { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
    @media(max-width:900px){ .renovacion-layout { grid-template-columns:1fr; } }
    .info-rows { display:flex; flex-direction:column; gap:8px; }
    .info-row { display:flex; justify-content:space-between; font-size:14px; }
    .info-row span { color:#718096; }
    .mono { font-family:monospace; }
    .sub-title { display:flex; align-items:center; gap:6px; font-size:14px; margin:8px 0; color:#1C4532; }
    .sub-title mat-icon { font-size:18px; width:18px; height:18px; }
    .pago-stats { display:flex; gap:24px; }
    .pago-stat { display:flex; flex-direction:column; align-items:center; }
    .pago-num { font-size:24px; font-weight:700; }
    .pago-num.verde { color:#16A34A; }
    .pago-lbl { font-size:11px; color:#718096; }
    .w-full { width:100%; }
    .field-label { font-size:12px; font-weight:600; color:#4A5568; display:block; margin:8px 0 6px; }
    .aval-toggle { width:100%; margin-bottom:12px; }
    .aval-toggle ::ng-deep .mat-button-toggle { flex:1; }
    .aval-fields { background:#F7FAFC; border-radius:8px; padding:12px; margin-bottom:12px; }
    .sim-preview {
      display:flex; gap:20px; background:#F0FFF4; border-radius:8px;
      padding:12px 14px; margin-bottom:12px;
    }
    .sim-preview div { display:flex; flex-direction:column; }
    .sim-preview span { font-size:11px; color:#276749; }
    .sim-preview strong { font-size:16px; color:#1C4532; }
    .cuota-ajuste {
      display:flex; align-items:center; gap:12px;
      margin:8px 0 4px; flex-wrap:wrap;
    }
    .cuota-ajuste .cuota-label { display:flex; flex-direction:column; font-size:13px; font-weight:600; }
    .cuota-ajuste .min-hint { font-size:11px; color:#718096; font-weight:400; }
    .cuota-ajuste .cuota-field { width:140px; margin-bottom:-1.25em; }
    .saldo-row { margin-top:6px; }
    .saldo-total-row {
      margin-top:4px; padding-top:6px;
      border-top:1px dashed #FCA5A5; font-weight:700;
    }
    .saldo-desc { color:#DC2626 !important; }
    .saldo-aviso {
      display:flex; align-items:flex-start; gap:6px;
      background:#FEF2F2; border:1px solid #FECACA; border-radius:8px;
      padding:8px 10px; margin-top:8px; font-size:12px; color:#991B1B;
    }
    .saldo-aviso mat-icon { font-size:18px; width:18px; height:18px; }
    .sim-desc { margin-top:4px; }
    .sim-desc span { color:#718096; }
    .sim-desc strong { font-size:14px; }
    .sim-entrega {
      margin-top:6px; padding-top:6px; border-top:1px dashed #9AE6B4;
    }
    .sim-entrega span { color:#276749; font-weight:600; }
    .sim-entrega strong { font-size:18px; color:#1C4532; }
    .loading-overlay { display:flex; justify-content:center; padding:48px; }
  `],
})
export class LoanRenovacionComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loading = signal(true);
  saving = signal(false);
  info = signal<any>(null);
  plazos = signal<any[]>([]);
  sim = signal<any>(null);
  // Cuota diaria: mínimo permitido (calculado) y valor actual (ajustable).
  minPayment = signal<number>(0);
  cuotaActual = signal<number>(0);

  // Saldo del crédito anterior que se liquidará (solo si no está liquidado).
  saldoADescontar = computed(() => {
    const prev = this.info()?.prevLoan;
    if (!prev || prev.status === 'LIQUIDADO') return 0;
    return Number(prev.saldoPendiente || 0);
  });

  // Monto solicitado como signal, para que los cálculos reaccionen a los
  // cambios del formulario (un computed no reacciona al valor de un
  // FormControl por sí solo; hay que reflejarlo en un signal).
  montoSolicitado = signal<number>(0);

  // Monto neto que recibe el cliente = solicitado − saldo anterior.
  montoEntregado = computed(() => {
    const solicitado = this.montoSolicitado();
    return Math.max(0, Math.round((solicitado - this.saldoADescontar()) * 100) / 100);
  });

  prevLoanId = '';

  form = this.fb.group({
    principalAmount: [null as number | null, [Validators.required, Validators.min(1)]],
    days:            [null as number | null, [Validators.required, Validators.min(1)]],
    avalMode:        ['NINGUNO', Validators.required],
    notes:           [''],
    aval: this.fb.group({
      fullName: [''],
      curp:     [''],
      phone:    [''],
      address:  [''],
    }),
  });

  ngOnInit() {
    this.prevLoanId = this.route.snapshot.paramMap.get('id')!;

    // Reflejar el monto del formulario en el signal, para que "Cliente recibe"
    // y las validaciones se actualicen en tiempo real al escribir.
    this.form.get('principalAmount')!.valueChanges.subscribe((v) => {
      this.montoSolicitado.set(Number(v || 0));
    });

    this.api.get<any>('/plazos-credito').subscribe({
      next: (r) => this.plazos.set(Array.isArray(r) ? r : r?.data ?? []),
    });
    this.api.get<any>(`/loans/${this.prevLoanId}/renovacion-info`).subscribe({
      next: (i) => { this.info.set(i); this.loading.set(false); },
      error: () => { this.loading.set(false); this.snackbar.open('No se pudo cargar la información', 'Cerrar', { duration: 5000 }); },
    });
  }

  onPlazoChange() { this.simulate(); }

  simulate() {
    const { principalAmount, days } = this.form.value;
    if (!principalAmount || !days) return;
    this.api.post<any>('/loans/simulate', { principalAmount, days }).subscribe({
      next: (r) => {
        this.sim.set(r);
        this.minPayment.set(r.minPayment ?? r.periodicPayment);
        this.cuotaActual.set(r.periodicPayment);
      },
    });
  }

  onCuotaInput(event: Event) {
    this.cuotaActual.set(Number((event.target as HTMLInputElement).value));
  }

  // Recalcula la simulación con la cuota que capturó el usuario. La cuota no
  // puede ser menor a la mínima (la calculada por la fórmula).
  recalcConCuota() {
    const { principalAmount, days } = this.form.value;
    const cuota = Number(this.cuotaActual());
    if (!principalAmount || !days) return;
    if (cuota < this.minPayment()) {
      this.snackbar.open(
        `La cuota no puede ser menor a ${this.minPayment()}`,
        'Cerrar',
        { duration: 4000 },
      );
      return;
    }
    this.api.post<any>('/loans/simulate', {
      principalAmount, days, customPayment: cuota,
    }).subscribe({
      next: (r) => {
        this.sim.set(r);
        this.minPayment.set(r.minPayment ?? r.periodicPayment);
      },
      error: (err) => this.snackbar.open(err.error?.message || 'Error al recalcular', 'Cerrar', { duration: 4000 }),
    });
  }

  renovar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.value;
    // Validar aval nuevo
    if (v.avalMode === 'NUEVO') {
      const a = v.aval!;
      if (!a.fullName || !a.curp || !a.phone) {
        this.snackbar.open('Completa los datos del aval nuevo', 'Cerrar', { duration: 4000 });
        return;
      }
    }
    this.saving.set(true);
    const cuota = Number(this.cuotaActual());
    const body: any = {
      principalAmount: v.principalAmount,
      days: v.days,
      avalMode: v.avalMode,
      notes: v.notes,
      // Solo se envía la cuota si el usuario la ajustó por encima de la mínima.
      customPayment: cuota > this.minPayment() ? cuota : undefined,
    };
    if (v.avalMode === 'NUEVO') {
      body.aval = { ...v.aval, curp: (v.aval!.curp || '').toUpperCase() };
    }

    this.api.post<any>(`/loans/${this.prevLoanId}/renovar`, body).subscribe({
      next: (r) => {
        this.snackbar.open('Renovación creada y autorizada', 'OK', { duration: 4000 });
        this.saving.set(false);
        this.router.navigate(['/loans', r.loan.id]);
      },
      error: (err) => {
        const msg = Array.isArray(err.error?.message) ? err.error.message[0] : (err.error?.message || 'Error');
        this.snackbar.open(msg, 'Cerrar', { duration: 6000 });
        this.saving.set(false);
      },
    });
  }
}