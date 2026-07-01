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
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar } from '@angular/material/snack-bar';

import { GestorService } from '../../core/gestor.service';
import {
  CreditoSemaforo, HistorialResponse, SimulacionResponse,
  ClienteDetalle, Aval, DireccionCliente,
} from '../../core/models';

interface Seguimiento {
  id: string;
  tipo: string;
  notas?: string;
  creadoEn: string;
}

@Component({
  selector: 'app-acciones',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatIconModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTabsModule, MatDatepickerModule,
    MatNativeDateModule, MatProgressSpinnerModule, MatExpansionModule,
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>
          <button mat-icon-button (click)="volver()"><mat-icon>arrow_back</mat-icon></button>
          Gestionar crédito
        </h1>
      </div>

      <div class="layout">
        <!-- ══ COLUMNA PRINCIPAL ══ -->
        <div class="main-col">
          <!-- Resumen del crédito -->
          <mat-card class="resumen">
            <div class="r-main">
              <span class="dot" [ngClass]="dotClass()"></span>
              <div>
                <div class="r-name">{{ credito()?.customerName || 'Cliente' }}</div>
                <div class="r-sub">
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

          <!-- Datos del cliente y aval -->
          <div class="datos-grid">
            <mat-card class="datos-card">
              <div class="dc-title"><mat-icon>person</mat-icon> Cliente</div>
              @if (cliente(); as cl) {
                <div class="dc-line"><mat-icon>badge</mat-icon><span>{{ cl.fullName }}</span></div>
                @if (cl.curp) { <div class="dc-line"><mat-icon>fingerprint</mat-icon><span>{{ cl.curp }}</span></div> }
                @if (cl.phone) {
                  <a class="dc-line link" [href]="'tel:' + cl.phone"><mat-icon>call</mat-icon><span>{{ cl.phone }}</span></a>
                }
                @if (domicilioCliente()) {
                  <div class="dc-line"><mat-icon>location_on</mat-icon><span>{{ domicilioCliente() }}</span></div>
                }
                @if (cl.occupation) { <div class="dc-line"><mat-icon>work</mat-icon><span>{{ cl.occupation }}</span></div> }
              } @else {
                <div class="dc-empty">Cargando datos del cliente...</div>
              }
            </mat-card>

            <mat-card class="datos-card">
              <div class="dc-title"><mat-icon>handshake</mat-icon> Aval</div>
              @if (avalCargado()) {
                @if (aval(); as av) {
                  <div class="dc-line"><mat-icon>badge</mat-icon><span>{{ av.fullName }}</span></div>
                  @if (av.relationship) { <div class="dc-line"><mat-icon>diversity_3</mat-icon><span>{{ av.relationship }}</span></div> }
                  @if (av.phone) {
                    <a class="dc-line link" [href]="'tel:' + av.phone"><mat-icon>call</mat-icon><span>{{ av.phone }}</span></a>
                  }
                  @if (av.address) { <div class="dc-line"><mat-icon>location_on</mat-icon><span>{{ av.address }}</span></div> }
                } @else {
                  <div class="dc-empty">Este crédito no tiene aval registrado.</div>
                }
              } @else {
                <div class="dc-empty">Cargando aval...</div>
              }
            </mat-card>
          </div>

          <!-- Historial de comportamiento (semáforo) -->
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
                  <p class="tab-hint">Acuerda un nuevo plan de pagos sin intereses para regularizar el crédito. El crédito actual se archiva.</p>
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
                  <p class="tab-hint">Genera un nuevo crédito con distinto monto o plazo. Simula antes de aplicar. El crédito actual se marca como reestructurado.</p>
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
                        <div class="sim-row"><span>Total a pagar</span><strong>{{ s.totalPayment | currency:'MXN' }}</strong></div>
                        <div class="sim-row"><span>Interés total</span><strong>{{ s.totalInterest | currency:'MXN' }}</strong></div>
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

        <!-- ══ PANEL LATERAL: SEGUIMIENTO ══ -->
        <aside class="side-col">
          <mat-card class="seg-card">
            <div class="seg-title"><mat-icon>forum</mat-icon> Seguimiento</div>

            <!-- Captura de nuevo seguimiento -->
            <form [formGroup]="segForm" (ngSubmit)="guardarSeguimiento()" class="seg-form">
              <mat-form-field appearance="outline" class="full">
                <mat-label>Tipo de contacto</mat-label>
                <mat-select formControlName="tipo">
                  <mat-option value="LLAMADA">Llamada</mat-option>
                  <mat-option value="MENSAJE">Mensaje</mat-option>
                  <mat-option value="VISITA">Visita</mat-option>
                  <mat-option value="OTRO">Otro</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full">
                <mat-label>Nota</mat-label>
                <textarea matInput rows="2" formControlName="notas"
                          placeholder="¿Qué pasó en este contacto?"></textarea>
              </mat-form-field>
              <button mat-flat-button color="primary" type="submit" class="full"
                      [disabled]="savingSeg() || segForm.invalid">
                @if (savingSeg()) { <mat-spinner diameter="20"></mat-spinner> }
                @else { <ng-container><mat-icon>add</mat-icon> Registrar contacto</ng-container> }
              </button>
            </form>

            <!-- Historial -->
            <div class="seg-hist-title">Contactos previos</div>
            @if (loadingSeg()) {
              <div class="seg-loading"><mat-spinner diameter="28"></mat-spinner></div>
            } @else if (seguimientos().length === 0) {
              <p class="seg-empty">Sin contactos registrados aún.</p>
            } @else {
              <div class="seg-list">
                @for (s of seguimientos(); track s.id) {
                  <div class="seg-item">
                    <div class="seg-item-head">
                      <span class="seg-tipo" [ngClass]="'seg-' + s.tipo.toLowerCase()">
                        <mat-icon>{{ tipoIcon(s.tipo) }}</mat-icon>
                        {{ tipoLabel(s.tipo) }}
                      </span>
                      <span class="seg-fecha">{{ formatFecha(s.creadoEn) }}</span>
                    </div>
                    @if (s.notas) { <div class="seg-nota">{{ s.notas }}</div> }
                  </div>
                }
              </div>
            }
          </mat-card>
        </aside>
      </div>
    </div>
  `,
  styles: [`
    .layout { display: grid; grid-template-columns: 1fr 340px; gap: 16px; align-items: start; }
    .main-col { min-width: 0; }
    .side-col { position: sticky; top: 80px; }

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

    .datos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    .datos-card { padding: 16px; }
    .dc-title {
      display: flex; align-items: center; gap: 8px; font-weight: 600;
      color: var(--blue-900); margin-bottom: 12px; font-size: 15px;
    }
    .dc-title mat-icon { color: var(--blue-500); }
    .dc-line {
      display: flex; align-items: center; gap: 8px; padding: 4px 0;
      color: var(--gray-800); font-size: 14px; text-decoration: none;
    }
    .dc-line mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--gray-400); flex-shrink: 0; }
    .dc-line.link:hover { color: var(--blue-600); }
    .dc-line.link:hover mat-icon { color: var(--blue-600); }
    .dc-empty { color: var(--gray-400); font-size: 13px; font-style: italic; }

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
    .sim-actions { margin-bottom: 12px; }
    .sim-result {
      background: var(--gray-50); border: 1px solid var(--gray-200);
      border-radius: 10px; padding: 12px 16px; margin-bottom: 14px;
    }
    .sim-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .sim-row span { color: var(--gray-600); }

    /* Panel de seguimiento */
    .seg-card { padding: 16px; }
    .seg-title {
      display: flex; align-items: center; gap: 8px; font-weight: 600;
      color: var(--blue-900); margin-bottom: 14px; font-size: 15px;
    }
    .seg-title mat-icon { color: var(--blue-500); }
    .seg-form { margin-bottom: 8px; }
    .seg-hist-title {
      font-size: 12px; text-transform: uppercase; letter-spacing: .04em;
      color: var(--gray-400); font-weight: 600; margin: 14px 0 8px;
    }
    .seg-loading { display: flex; justify-content: center; padding: 20px; }
    .seg-empty { color: var(--gray-400); font-size: 13px; font-style: italic; }
    .seg-list { display: flex; flex-direction: column; gap: 8px; max-height: 420px; overflow-y: auto; }
    .seg-item { background: var(--gray-50); border-radius: 8px; padding: 10px 12px; }
    .seg-item-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .seg-tipo {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
    }
    .seg-tipo mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .seg-llamada { background: #dbeafe; color: #1e40af; }
    .seg-mensaje { background: #dcfce7; color: #166534; }
    .seg-visita  { background: #fef3c7; color: #92400e; }
    .seg-otro    { background: #f3e8ff; color: #6b21a8; }
    .seg-fecha { font-size: 11px; color: var(--gray-400); }
    .seg-nota { font-size: 13px; color: var(--gray-800); margin-top: 6px; }

    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .side-col { position: static; }
      .datos-grid { grid-template-columns: 1fr; }
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
  cliente = signal<ClienteDetalle | null>(null);
  aval = signal<Aval | null>(null);
  avalCargado = signal(false);
  historial = signal<HistorialResponse | null>(null);
  simulacion = signal<SimulacionResponse | null>(null);
  saving = signal(false);
  simulando = signal(false);

  seguimientos = signal<Seguimiento[]>([]);
  loadingSeg = signal(true);
  savingSeg = signal(false);

  promesaForm = this.fb.group({
    fecha: [null as Date | null, Validators.required],
    monto: [null as number | null, [Validators.required, Validators.min(1)]],
    notas: [''],
  });

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

  segForm = this.fb.group({
    tipo: ['LLAMADA', Validators.required],
    notas: [''],
  });

  ngOnInit() {
    this.loanId = this.route.snapshot.paramMap.get('loanId')!;
    const nav = history.state?.credito as CreditoSemaforo | undefined;
    if (nav) this.credito.set(nav);

    // Cargar detalle del crédito (para cliente) y aval.
    this.gestor.getLoan(this.loanId).subscribe({
      next: (loan) => {
        const c = loan?.customer;
        if (c) {
          this.cliente.set({
            id: c.id, fullName: c.fullName, curp: c.curp, rfc: c.rfc,
            phone: c.phone, email: c.email, address: c.address, occupation: c.occupation,
          });
          // Historial de comportamiento del cliente (semáforo).
          if (c.id) {
            this.gestor.getHistorial(c.id).subscribe({
              next: (h) => this.historial.set(h),
              error: () => {},
            });
          }
        }
      },
      error: () => {},
    });

    this.gestor.getAval(this.loanId).subscribe({
      next: (av) => { this.aval.set(av || null); this.avalCargado.set(true); },
      error: () => { this.aval.set(null); this.avalCargado.set(true); },
    });

    this.cargarSeguimientos();
  }

  cargarSeguimientos() {
    this.loadingSeg.set(true);
    this.gestor.getSeguimientos(this.loanId).subscribe({
      next: (list) => {
        // Solo tipos de seguimiento de gestión (excluye promesas y no-localizado).
        const segTipos = ['LLAMADA', 'MENSAJE', 'VISITA', 'OTRO'];
        this.seguimientos.set(list.filter((s) => segTipos.includes(s.tipo)));
        this.loadingSeg.set(false);
      },
      error: () => { this.seguimientos.set([]); this.loadingSeg.set(false); },
    });
  }

  // ── Seguimiento ──
  guardarSeguimiento() {
    if (this.segForm.invalid) return;
    this.savingSeg.set(true);
    const v = this.segForm.value;
    this.gestor.registrarSeguimiento(this.loanId, v.tipo!, v.notas || undefined).subscribe({
      next: () => {
        this.savingSeg.set(false);
        this.segForm.patchValue({ notas: '' });
        this.snack.open('Contacto registrado', 'OK', { duration: 2500 });
        this.cargarSeguimientos();
      },
      error: (e) => { this.savingSeg.set(false); this.fail(e, false); },
    });
  }

  // ── Promesa ──
  guardarPromesa() {
    if (this.promesaForm.invalid) return;
    this.saving.set(true);
    const v = this.promesaForm.value;
    this.gestor.promesaPago(this.loanId, this.toISODate(v.fecha!), Number(v.monto), v.notas || undefined).subscribe({
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
  domicilioCliente(): string | null {
    const a = this.cliente()?.address;
    if (!a) return null;
    if (typeof a === 'string') return a;
    const dir = a as DireccionCliente;
    const line = [dir.street, dir.colonia, dir.municipality].filter(Boolean).join(', ');
    return line || null;
  }

  private toISODate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  formatFecha(iso: string): string {
    try {
      return new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(iso)).replace(',', '');
    } catch { return iso; }
  }

  tipoIcon(t: string): string {
    return { LLAMADA: 'call', MENSAJE: 'chat', VISITA: 'directions_walk', OTRO: 'more_horiz' }[t] || 'more_horiz';
  }
  tipoLabel(t: string): string {
    return { LLAMADA: 'Llamada', MENSAJE: 'Mensaje', VISITA: 'Visita', OTRO: 'Otro' }[t] || t;
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