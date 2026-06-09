import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-loan-restructure',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatStepperModule, MatDividerModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon color="warn">refresh</mat-icon> Reestructuración de crédito</h1>
      <a mat-stroked-button [routerLink]="['/loans', loanId()]">
        <mat-icon>arrow_back</mat-icon> Volver
      </a>
    </div>
    @if (loading()) {
      <div class="loading-overlay"><mat-spinner></mat-spinner></div>
    } @else if (loan()) {
      <mat-stepper linear>

        <!-- PASO 1: crédito original -->
        <mat-step label="Crédito original" [completed]="true">
          <mat-card>
            <mat-card-header><mat-card-title>Crédito a reestructurar</mat-card-title></mat-card-header>
            <mat-card-content>
              <div class="info-rows">
                <div class="info-row"><span>Cliente</span><strong>{{ loan()!.customer?.fullName }}</strong></div>
                <div class="info-row"><span>Monto original</span><strong>{{ loan()!.principalAmount | currency:'MXN' }}</strong></div>
                <div class="info-row"><span>Plazo original</span><strong>{{ loan()!.termWeeks }} días</strong></div>
                <div class="info-row"><span>Cuota original</span><strong>{{ loan()!.periodicPayment | currency:'MXN' }}</strong></div>
                <div class="info-row"><span>Estado</span><strong>{{ loan()!.status }}</strong></div>
              </div>
            </mat-card-content>
            <mat-card-actions>
              <button mat-raised-button color="primary" matStepperNext>Siguiente</button>
            </mat-card-actions>
          </mat-card>
        </mat-step>

        <!-- PASO 2: nuevas condiciones -->
        <mat-step label="Nuevas condiciones">
          <mat-card>
            <mat-card-content>
              <form [formGroup]="form" class="step-form">
                <mat-form-field appearance="outline">
                  <mat-label>Nuevo monto *</mat-label>
                  <input matInput type="number" formControlName="principalAmount" (change)="simulate()">
                  <span matPrefix>$&nbsp;</span>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Nuevo plazo (días) *</mat-label>
                  <mat-select formControlName="days" (selectionChange)="simulate()">
                    @for (p of plazos(); track p.id) {
                      <mat-option [value]="p.days">{{ p.days }} días — {{ (p.percentage * 100).toFixed(0) }}%</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Motivo *</mat-label>
                  <mat-select formControlName="reason">
                    <mat-option value="DESEMPLEO">Desempleo</mat-option>
                    <mat-option value="ENFERMEDAD">Enfermedad</mat-option>
                    <mat-option value="REDUCCION_INGRESOS">Reducción de ingresos</mat-option>
                    <mat-option value="OTRO">Otro</mat-option>
                  </mat-select>
                </mat-form-field>
              </form>

              @if (sim()) {
                <div class="cuota-ajuste">
                  <div class="cuota-label">
                    <span>Cuota diaria (ajustable)</span>
                    <span class="min-hint">Mínimo: {{ minPayment() | currency:'MXN' }}</span>
                  </div>
                  <mat-form-field appearance="outline" class="cuota-field">
                    <input matInput type="number" step="1" [value]="cuotaActual()" (input)="onCuotaInput($event)">
                    <span matPrefix>$&nbsp;</span>
                  </mat-form-field>
                  <button mat-stroked-button color="primary" type="button" (click)="recalcConCuota()">
                    <mat-icon>refresh</mat-icon> Aplicar
                  </button>
                </div>
                <div class="sim-preview">
                  <div class="sim-item"><span>Cuota diaria</span><strong>{{ sim()!.periodicPayment | currency:'MXN' }}</strong></div>
                  <div class="sim-item"><span>Total a pagar</span><strong>{{ sim()!.totalPayment | currency:'MXN' }}</strong></div>
                </div>
              }
            </mat-card-content>
            <mat-card-actions>
              <button mat-stroked-button matStepperPrevious>Anterior</button>
              <button mat-raised-button color="primary" matStepperNext [disabled]="form.invalid || !sim()">Siguiente</button>
            </mat-card-actions>
          </mat-card>
        </mat-step>

        <!-- PASO 3: confirmar -->
        <mat-step label="Confirmar">
          <mat-card>
            <mat-card-content>
              <div class="info-rows">
                <div class="info-row"><span>Nuevo monto</span><strong class="primary">{{ form.value.principalAmount | currency:'MXN' }}</strong></div>
                <div class="info-row"><span>Nuevo plazo</span><strong>{{ form.value.days }} días</strong></div>
                <div class="info-row"><span>Cuota diaria</span><strong>{{ cuotaActual() | currency:'MXN' }}</strong></div>
                <div class="info-row"><span>Motivo</span><strong>{{ form.value.reason }}</strong></div>
              </div>
              <div class="warning-box">
                <mat-icon color="warn">warning</mat-icon>
                <p>El crédito actual quedará como REESTRUCTURADO y se creará uno nuevo activo. Esta acción no se puede deshacer.</p>
              </div>
            </mat-card-content>
            <mat-card-actions>
              <button mat-stroked-button matStepperPrevious>Anterior</button>
              <button mat-raised-button color="warn" (click)="confirm()" [disabled]="submitting()">
                @if (submitting()) { <mat-spinner diameter="20"></mat-spinner> } @else { <mat-icon>check</mat-icon> }
                Confirmar reestructuración
              </button>
            </mat-card-actions>
          </mat-card>
        </mat-step>
      </mat-stepper>
    }
  `,
  styles: [`
    .info-rows { display:flex; flex-direction:column; gap:8px; }
    .info-row { display:flex; justify-content:space-between; font-size:14px; }
    .info-row span { color:#718096; }
    .info-row .primary { color:#1C4532; font-size:16px; }
    .step-form { display:flex; flex-direction:column; gap:4px; margin-top:8px; }
    .cuota-ajuste {
      display:flex; align-items:center; gap:12px; flex-wrap:wrap;
      background:#F7FAFC; border-radius:10px; padding:12px 14px; margin:12px 0;
    }
    .cuota-label { display:flex; flex-direction:column; font-size:13px; font-weight:600; }
    .min-hint { font-size:11px; color:#718096; font-weight:400; }
    .cuota-field { width:140px; margin-bottom:-1.25em; }
    .sim-preview { display:flex; gap:20px; background:#F0FFF4; border-radius:8px; padding:12px 14px; }
    .sim-item { display:flex; flex-direction:column; }
    .sim-item span { font-size:11px; color:#276749; }
    .sim-item strong { font-size:16px; color:#1C4532; }
    .warning-box {
      display:flex; align-items:center; gap:10px; background:#FEF2F2;
      border:1px solid #FECACA; border-radius:8px; padding:12px 14px; margin-top:16px;
    }
    .warning-box p { margin:0; font-size:13px; color:#991B1B; }
    .loading-overlay { display:flex; justify-content:center; padding:48px; }
  `],
})
export class LoanRestructureComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loanId = signal('');
  loan = signal<any>(null);
  loading = signal(true);
  submitting = signal(false);
  plazos = signal<any[]>([]);
  sim = signal<any>(null);
  minPayment = signal<number>(0);
  cuotaActual = signal<number>(0);

  form = this.fb.group({
    principalAmount: [null as number | null, [Validators.required, Validators.min(1)]],
    days:            [null as number | null, [Validators.required, Validators.min(1)]],
    reason:          ['', Validators.required],
  });

  ngOnInit() {
    this.loanId.set(this.route.snapshot.paramMap.get('id')!);
    this.api.get<any>('/plazos-credito').subscribe({
      next: (r) => this.plazos.set(Array.isArray(r) ? r : r?.data ?? []),
    });
    this.api.get<any>(`/loans/${this.loanId()}`).subscribe({
      next: (l) => { this.loan.set(l); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

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

  recalcConCuota() {
    const { principalAmount, days } = this.form.value;
    const cuota = Number(this.cuotaActual());
    if (!principalAmount || !days) return;
    if (cuota < this.minPayment()) {
      this.snackbar.open(`La cuota no puede ser menor a ${this.minPayment()}`, 'Cerrar', { duration: 4000 });
      return;
    }
    this.api.post<any>('/loans/simulate', { principalAmount, days, customPayment: cuota }).subscribe({
      next: (r) => { this.sim.set(r); this.minPayment.set(r.minPayment ?? r.periodicPayment); },
      error: (err) => this.snackbar.open(err.error?.message || 'Error al recalcular', 'Cerrar', { duration: 4000 }),
    });
  }

  confirm() {
    if (this.form.invalid) return;
    this.submitting.set(true);
    const cuota = Number(this.cuotaActual());
    this.api.post<any>(`/loans/${this.loanId()}/restructure`, {
      principalAmount:   this.form.value.principalAmount,
      days:              this.form.value.days,
      customPayment:     cuota > this.minPayment() ? cuota : undefined,
      restructureReason: this.form.value.reason,
    }).subscribe({
      next: (r) => {
        this.snackbar.open('Reestructuración exitosa', 'OK', { duration: 5000 });
        this.submitting.set(false);
        if (r?.loan?.id) this.router.navigate(['/loans', r.loan.id]);
      },
      error: (err: any) => {
        this.snackbar.open(err.error?.message?.[0] || err.error?.message || 'Error', 'Cerrar', { duration: 5000 });
        this.submitting.set(false);
      },
    });
  }
}