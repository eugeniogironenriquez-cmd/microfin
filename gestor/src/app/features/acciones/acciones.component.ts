import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { GestorService } from '../../core/gestor.service';
import { CreditoSemaforo, HistorialResponse, SimulacionResponse } from '../../core/models';

@Component({
  selector: 'app-acciones',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatIconModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTabsModule, MatDatepickerModule,
    MatNativeDateModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>
          <button mat-icon-button (click)="volver()"><mat-icon>arrow_back</mat-icon></button>
          Gestionar crédito
        </h1>
      </div>

      <!-- Resumen del crédito -->
      <mat-card class="resumen">
        <div class="r-main">
          <span class="dot" [ngClass]="dotClass()"></span>
          <div>
            <div class="r-name">{{ credito()?.customerName || 'Cliente' }}</div>
            <div class="r-sub">
              @if (credito()?.phone) { <span>{{ credito()?.phone }}</span> }
              @if (credito()?.cuotasVencidas != null) {
                <span class="nivel-chip" [ngClass]="chipClass()">
                  {{ credito()?.cuotasVencidas }} cuotas vencidas
                </span>
              }
            </div>
          </div>
        </div>
        @if (credito()?.saldoPendiente != null) {
          <div class="r-saldo">
            <span class="r-saldo-lbl">Saldo pendiente</span>
            <span class="r-saldo-val">{{ credito()!.saldoPendiente | currency:'MXN':'symbol':'1.2-2' }}</span>
          </div>
        }
      </mat-card>

      <!-- Historial de comportamiento -->
      @if (historial(); as h) {
        @if (h.resumen.tieneProblemas) {
          <mat-card class="historial">
            <div class="h-title"><mat-icon>history</mat-icon> Historial de comportamiento</div>
            <div class="h-stats">
              <div class="h-stat"><strong>{{ h.resumen.vecesRojo }}</strong><span>veces en rojo</span></div>
              <div class="h-stat"><strong>{{ h.resumen.vecesAmarillo }}</strong><span>veces en amarillo</span></div>
              <div class="h-stat"><strong>{{ h.resumen.maxCuotasVencidas }}</strong><span>máx. vencidas</span></div>
            </div>
          </mat-card>
        }
      }

      <!-- Acciones en tabs -->
      <mat-card class="acciones-card">
        <mat-tab-group animationDuration="150ms">
          <!-- PROMESA DE PAGO -->
          <mat-tab label="Promesa de pago">
            <div class="tab-body">
              <p class="tab-hint">Registra el compromiso del cliente de pagar en una fecha.</p>
              <form [formGroup]="promesaForm" (ngSubmit)="guardarPromesa()">
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Fecha prometida</mat-label>
                  <input matInput [matDatepicker]="dp" formControlName="fecha">
                  <mat-datepicker-toggle matSuffix [for]="dp"></mat-datepicker-toggle>
                  <mat-datepicker #dp></mat-datepicker>
                </mat-form-field>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Monto prometido</mat-label>
                  <span matPrefix>$&nbsp;</span>
                  <input matInput type="number" formControlName="monto">
                </mat-form-field>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Notas (opcional)</mat-label>
                  <textarea matInput rows="2" formControlName="notas"></textarea>
                </mat-form-field>
                <button mat-raised-button color="primary" type="submit" [disabled]="saving() || promesaForm.invalid">
                  @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                  @else { <ng-container><mat-icon>event_available</mat-icon> Registrar promesa</ng-container> }
                </button>
              </form>
            </div>
          </mat-tab>

          <!-- CONVENIO -->
          <mat-tab label="Convenio">
            <div class="tab-body">
              <p class="tab-hint">Acuerda un nuevo plan de pagos para regularizar el crédito.</p>
              <div class="ajustar-nota">
                <mat-icon>info</mat-icon>
                Los campos de convenio se ajustarán con los exactos del backend.
              </div>
              <form [formGroup]="convenioForm" (ngSubmit)="guardarConvenio()">
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Monto del convenio</mat-label>
                  <span matPrefix>$&nbsp;</span>
                  <input matInput type="number" formControlName="montoConvenio">
                </mat-form-field>
                <div class="grid-2">
                  <mat-form-field appearance="outline">
                    <mat-label>Número de pagos</mat-label>
                    <input matInput type="number" formControlName="numeroPagos">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Periodicidad</mat-label>
                    <mat-select formControlName="periodicidad">
                      <mat-option value="DIARIO">Diario</mat-option>
                      <mat-option value="SEMANAL">Semanal</mat-option>
                      <mat-option value="QUINCENAL">Quincenal</mat-option>
                      <mat-option value="MENSUAL">Mensual</mat-option>
                    </mat-select>
                  </mat-form-field>
                </div>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Fecha del primer pago</mat-label>
                  <input matInput [matDatepicker]="dpc" formControlName="fechaPrimerPago">
                  <mat-datepicker-toggle matSuffix [for]="dpc"></mat-datepicker-toggle>
                  <mat-datepicker #dpc></mat-datepicker>
                </mat-form-field>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Notas (opcional)</mat-label>
                  <textarea matInput rows="2" formControlName="notes"></textarea>
                </mat-form-field>
                <button mat-raised-button color="primary" type="submit" [disabled]="saving() || convenioForm.invalid">
                  @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                  @else { <ng-container><mat-icon>handshake</mat-icon> Generar convenio</ng-container> }
                </button>
              </form>
            </div>
          </mat-tab>

          <!-- REESTRUCTURA -->
          <mat-tab label="Reestructura">
            <div class="tab-body">
              <p class="tab-hint">Genera un nuevo crédito con distinto monto o plazo. Simula antes de aplicar.</p>
              <div class="ajustar-nota">
                <mat-icon>info</mat-icon>
                Los campos de reestructura se ajustarán con los exactos del backend.
              </div>
              <form [formGroup]="reestructuraForm">
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Nuevo monto (principal)</mat-label>
                  <span matPrefix>$&nbsp;</span>
                  <input matInput type="number" formControlName="principalAmount">
                </mat-form-field>
                <div class="grid-2">
                  <mat-form-field appearance="outline">
                    <mat-label>Plazo (días)</mat-label>
                    <input matInput type="number" formControlName="days">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Cuota personalizada (opcional)</mat-label>
                    <input matInput type="number" formControlName="customPayment">
                  </mat-form-field>
                </div>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Motivo de reestructura</mat-label>
                  <textarea matInput rows="2" formControlName="restructureReason"></textarea>
                </mat-form-field>

                <div class="sim-actions">
                  <button mat-stroked-button type="button" (click)="simular()" [disabled]="simulando()">
                    @if (simulando()) { <mat-spinner diameter="20"></mat-spinner> }
                    @else { <ng-container><mat-icon>calculate</mat-icon> Simular</ng-container> }
                  </button>
                </div>

                @if (simulacion(); as s) {
                  <div class="sim-result">
                    <div class="sim-row"><span>Nueva cuota</span><strong>{{ s.periodicPayment | currency:'MXN' }}</strong></div>
                    <div class="sim-row"><span>Total a pagar</span><strong>{{ s.totalAmount | currency:'MXN' }}</strong></div>
                  </div>
                }

                <button mat-raised-button color="primary" type="button" (click)="guardarReestructura()"
                        [disabled]="saving() || reestructuraForm.invalid">
                  @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                  @else { <ng-container><mat-icon>autorenew</mat-icon> Aplicar reestructura</ng-container> }
                </button>
              </form>
            </div>
          </mat-tab>
        </mat-tab-group>
      </mat-card>
    </div>
  `,
  styles: [`
    .resumen {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 20px; margin-bottom: 14px; flex-wrap: wrap; gap: 12px;
    }
    .r-main { display: flex; align-items: center; gap: 12px; }
    .r-main .dot { width: 16px; height: 16px; }
    .r-name { font-weight: 700; font-size: 16px; }
    .r-sub { display: flex; align-items: center; gap: 10px; color: var(--gray-600); font-size: 13px; margin-top: 2px; }
    .r-saldo { text-align: right; display: flex; flex-direction: column; }
    .r-saldo-lbl { font-size: 12px; color: var(--gray-600); }
    .r-saldo-val { font-size: 20px; font-weight: 700; color: var(--blue-900); }

    .historial { padding: 14px 20px; margin-bottom: 14px; }
    .h-title { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--amarillo); margin-bottom: 10px; }
    .h-stats { display: flex; gap: 24px; }
    .h-stat { display: flex; flex-direction: column; }
    .h-stat strong { font-size: 20px; color: var(--gray-900); }
    .h-stat span { font-size: 12px; color: var(--gray-600); }

    .acciones-card { padding: 0; overflow: hidden; }
    .tab-body { padding: 22px; }
    .tab-hint { color: var(--gray-600); font-size: 14px; margin: 0 0 16px; }
    .full { width: 100%; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .ajustar-nota {
      display: flex; align-items: center; gap: 8px;
      background: #eff6ff; color: #1e40af; border-radius: 8px;
      padding: 10px 12px; font-size: 13px; margin-bottom: 14px;
    }
    .ajustar-nota mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .sim-actions { margin-bottom: 12px; }
    .sim-result {
      background: var(--gray-50); border: 1px solid var(--gray-200);
      border-radius: 10px; padding: 12px 16px; margin-bottom: 14px;
    }
    .sim-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .sim-row span { color: var(--gray-600); }

    @media (max-width: 599px) {
      .grid-2 { grid-template-columns: 1fr; }
    }
  `],
})
export class AccionesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private gestor = inject(GestorService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  loanId = '';
  credito = signal<CreditoSemaforo | null>(null);
  historial = signal<HistorialResponse | null>(null);
  simulacion = signal<SimulacionResponse | null>(null);
  saving = signal(false);
  simulando = signal(false);

  promesaForm = this.fb.group({
    fecha: [null as Date | null, Validators.required],
    monto: [null as number | null, [Validators.required, Validators.min(1)]],
    notas: [''],
  });

  // Los campos exactos de convenio/reestructura se ajustan con el backend.
  convenioForm = this.fb.group({
    montoConvenio: [null as number | null, [Validators.required, Validators.min(1)]],
    numeroPagos: [null as number | null, [Validators.required, Validators.min(1)]],
    periodicidad: ['SEMANAL', Validators.required],
    fechaPrimerPago: [null as Date | null, Validators.required],
    notes: [''],
  });

  reestructuraForm = this.fb.group({
    principalAmount: [null as number | null, [Validators.required, Validators.min(1)]],
    days: [null as number | null, [Validators.required, Validators.min(1)]],
    customPayment: [null as number | null],
    restructureReason: ['', Validators.required],
  });

  ngOnInit() {
    this.loanId = this.route.snapshot.paramMap.get('loanId')!;
    // El crédito puede venir por state de navegación (evita otra llamada).
    const nav = history.state?.credito as CreditoSemaforo | undefined;
    if (nav) this.credito.set(nav);

    // Cargar historial del cliente si tenemos su id.
    const customerId = nav?.customerId;
    if (customerId) {
      this.gestor.getHistorial(customerId).subscribe({
        next: (h) => this.historial.set(h),
        error: () => {},
      });
    }
  }

  // ── Promesa ──
  guardarPromesa() {
    if (this.promesaForm.invalid) return;
    this.saving.set(true);
    const v = this.promesaForm.value;
    const fecha = this.toISODate(v.fecha!);
    this.gestor.promesaPago(this.loanId, fecha, Number(v.monto), v.notas || undefined).subscribe({
      next: () => this.ok('Promesa de pago registrada'),
      error: (e) => this.fail(e),
    });
  }

  // ── Convenio ──
  guardarConvenio() {
    if (this.convenioForm.invalid) return;
    this.saving.set(true);
    const v = this.convenioForm.value;
    this.gestor.convenio(this.loanId, {
      montoConvenio: Number(v.montoConvenio),
      numeroPagos: Number(v.numeroPagos),
      periodicidad: v.periodicidad,
      fechaPrimerPago: this.toISODate(v.fechaPrimerPago!),
      notes: v.notes || undefined,
    }).subscribe({
      next: () => this.ok('Convenio generado'),
      error: (e) => this.fail(e),
    });
  }

  // ── Reestructura ──
  simular() {
    const v = this.reestructuraForm.value;
    if (!v.principalAmount || !v.days) {
      this.snack.open('Ingresa monto y plazo para simular', 'Cerrar', { duration: 3000 });
      return;
    }
    this.simulando.set(true);
    this.gestor.simular(Number(v.principalAmount), Number(v.days), v.customPayment ? Number(v.customPayment) : undefined).subscribe({
      next: (s) => { this.simulacion.set(s); this.simulando.set(false); },
      error: (e) => { this.simulando.set(false); this.fail(e, false); },
    });
  }

  guardarReestructura() {
    if (this.reestructuraForm.invalid) return;
    this.saving.set(true);
    const v = this.reestructuraForm.value;
    this.gestor.reestructurar(this.loanId, {
      principalAmount: Number(v.principalAmount),
      days: Number(v.days),
      customPayment: v.customPayment ? Number(v.customPayment) : undefined,
      restructureReason: v.restructureReason,
    }).subscribe({
      next: () => this.ok('Reestructura aplicada'),
      error: (e) => this.fail(e),
    });
  }

  // ── Utilidades ──
  private toISODate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private ok(msg: string) {
    this.saving.set(false);
    this.snack.open(msg, 'OK', { duration: 3000 });
    this.router.navigate(['/gestor']);
  }

  private fail(err: any, resetSaving = true) {
    if (resetSaving) this.saving.set(false);
    this.snack.open(err?.error?.message || 'Ocurrió un error', 'Cerrar', { duration: 4000 });
  }

  volver() {
    this.router.navigate(['/gestor']);
  }

  dotClass() {
    const n = this.credito()?.nivel;
    return n ? { VERDE: 'dot-verde', AMARILLO: 'dot-amarillo', ROJO: 'dot-rojo' }[n] : 'dot-rojo';
  }
  chipClass() {
    const n = this.credito()?.nivel;
    return n ? { VERDE: 'nivel-verde', AMARILLO: 'nivel-amarillo', ROJO: 'nivel-rojo' }[n] : 'nivel-rojo';
  }
}
