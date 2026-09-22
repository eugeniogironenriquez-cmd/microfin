import { Component, OnInit, Inject, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ApiService, AuthService, Loan, PaymentSchedule } from '../../core/index';
import { PdfDownloadService } from '../../core/pdf-download.service';
import { GuarantorFormComponent } from './guarantor-form.component';

// ══════════════════════════════════════════════════════════════════
// DIÁLOGO: Editar monto del crédito
// Corrige monto_principal y total_amount SIN regenerar el calendario.
// Uso previsto: corrección de cargas manuales con monto erróneo.
// ══════════════════════════════════════════════════════════════════
interface EditMontoData {
  loanId: string;
  principalAmount: number;
  totalAmount: number;
}

@Component({
  selector: 'app-edit-monto-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, CurrencyPipe,
    MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon style="vertical-align:middle;color:#C2410C">edit</mat-icon>
      Editar monto del crédito
    </h2>

    <mat-dialog-content>
      <div class="warn-box">
        <mat-icon>warning_amber</mat-icon>
        <span>
          Esta opción corrige el monto por una carga errónea.
          <strong>No regenera el calendario de pagos</strong> ni recalcula las cuotas.
        </span>
      </div>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Monto principal</mat-label>
        <span matTextPrefix>$&nbsp;</span>
        <input matInput type="number" min="0" step="0.01" [(ngModel)]="principal">
      </mat-form-field>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Total a pagar</mat-label>
        <span matTextPrefix>$&nbsp;</span>
        <input matInput type="number" min="0" step="0.01" [(ngModel)]="total">
      </mat-form-field>

      <div class="prev-row">
        <span>Antes:</span>
        <span class="mono">{{ data.principalAmount | currency:'MXN' }} / {{ data.totalAmount | currency:'MXN' }}</span>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="cancelar()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="guardar()"
              [disabled]="!valido()">
        <mat-icon>save</mat-icon> Guardar cambios
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .w-full { width:100%; margin-top:8px; }
    .warn-box {
      display:flex; align-items:flex-start; gap:10px;
      background:#FFF7ED; border:1px solid #FED7AA; border-radius:8px;
      padding:12px; margin-bottom:16px; font-size:13px; color:#9A3412;
    }
    .warn-box mat-icon { color:#EA580C; flex-shrink:0; }
    .prev-row {
      display:flex; justify-content:space-between; gap:12px;
      font-size:13px; color:#718096; padding:4px 2px;
    }
    .mono { font-variant-numeric:tabular-nums; font-weight:600; }
  `],
})
export class EditMontoDialogComponent {
  principal: number;
  total: number;

  constructor(
    public dialogRef: MatDialogRef<EditMontoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EditMontoData,
  ) {
    this.principal = Number(data.principalAmount || 0);
    this.total = Number(data.totalAmount || 0);
  }

  valido(): boolean {
    return this.principal > 0 && this.total > 0;
  }

  cancelar() { this.dialogRef.close(); }

  guardar() {
    if (!this.valido()) return;
    this.dialogRef.close({
      principalAmount: Number(this.principal),
      totalAmount: Number(this.total),
    });
  }
}

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, RouterLink,
    MatCardModule, MatButtonModule, MatIconModule, MatTabsModule,
    MatTableModule, MatProgressSpinnerModule, MatSnackBarModule,
    MatDividerModule, MatChipsModule, MatTooltipModule, MatDialogModule,
    GuarantorFormComponent,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>attach_money</mat-icon> Detalle del préstamo</h1>
      <div class="header-actions">
        <a mat-stroked-button routerLink="/loans">
          <mat-icon>arrow_back</mat-icon> Volver
        </a>
        @if (loan()?.status === 'SOLICITUD' && auth.can('prestamos.autorizar')) {
          <button mat-raised-button color="primary" (click)="authorize('APPROVE')">
            <mat-icon>check_circle</mat-icon> Autorizar
          </button>
          <button mat-raised-button color="warn" (click)="authorize('REJECT')">
            <mat-icon>cancel</mat-icon> Rechazar
          </button>
        }
        @if (loan()?.status === 'AUTORIZADO' && auth.can('prestamos.desembolsar')) {
          <button mat-raised-button color="primary" (click)="disburse()">
            <mat-icon>payments</mat-icon> Desembolsar
          </button>
        }
        @if (loan() && loan()!.status !== 'SOLICITUD' && loan()!.status !== 'RECHAZADO') {
          <button mat-stroked-button (click)="downloadPlanPdf()">
            <mat-icon>picture_as_pdf</mat-icon> Plan de pagos
          </button>
        }
        @if (loan()?.disbursedAt) {
          <button mat-stroked-button (click)="downloadContractPdf()">
            <mat-icon>description</mat-icon> Contrato PDF
          </button>
        }
        @if (puedeRenovar() && auth.can('prestamos.reestructurar')) {
          <button mat-raised-button color="primary" (click)="renovar()">
            <mat-icon>autorenew</mat-icon> Renovar
          </button>
        }
        <!-- OCULTO (movido al portal del gestor): botón Convenio
        @if ((loan()?.status === 'VENCIDO' || loan()?.status === 'ATRASADO') && auth.can('prestamos.reestructurar')) {
          <button mat-stroked-button color="warn" (click)="convenio()">
            <mat-icon>handshake</mat-icon> Convenio
          </button>
        }
        -->
      </div>
    </div>

    @if (loading()) {
      <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
    } @else if (loan()) {
      <mat-tab-group>

        <!-- TAB: INFORMACIÓN -->
        <mat-tab label="Información">
          <div class="tab-content">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
              <mat-card>
                <mat-card-header><mat-card-title>Datos del crédito</mat-card-title></mat-card-header>
                <mat-card-content>
                  <div class="info-rows">
                    <div class="info-row"><span>Folio</span><strong class="font-mono">{{ loan()!.id.toUpperCase() }}</strong></div>
                    <div class="info-row"><span>Estado</span>
                      <span class="badge badge-{{ loan()!.status | lowercase }}">{{ loan()!.status }}</span>
                    </div>
                    <div class="info-row"><span>Monto</span>
                      <strong class="monto-editable">
                        {{ loan()!.principalAmount | currency:'MXN' }}
                        @if (auth.can('prestamos.editar-monto')) {
                          <button mat-icon-button class="edit-monto-btn"
                                  matTooltip="Corregir monto" (click)="editarMonto()">
                            <mat-icon>edit</mat-icon>
                          </button>
                        }
                      </strong>
                    </div>
                    <div class="info-row"><span>Plazo</span><strong>{{ loan()!.termWeeks }} días</strong></div>
                    <div class="info-row"><span>Cuota diaria</span><strong>{{ loan()!.periodicPayment | currency:'MXN' }}</strong></div>
                    <div class="info-row"><span>Total a pagar</span><strong>{{ loan()!.totalAmount | currency:'MXN' }}</strong></div>
                    @if (loan()!.disbursedAt) {
                      <div class="info-row"><span>Desembolso</span><strong>{{ loan()!.disbursedAt | date:'dd/MM/yyyy':'UTC' }}</strong></div>
                    }
                    @if (totalMoraGenerada() > 0) {
                      <div class="info-row"><span>Mora generada (total)</span><strong style="color:#C2410C">{{ totalMoraGenerada() | currency:'MXN' }}</strong></div>
                      <div class="info-row"><span>Mora pagada</span><strong style="color:#16A34A">{{ totalMoraPagada() | currency:'MXN' }}</strong></div>
                      <div class="info-row"><span>Mora pendiente</span><strong style="color:#DC2626">{{ totalMoraPendiente() | currency:'MXN' }}</strong></div>
                    }
                  </div>
                </mat-card-content>
              </mat-card>

              <mat-card>
                <mat-card-header><mat-card-title>Cliente</mat-card-title></mat-card-header>
                <mat-card-content>
                  <div class="info-rows">
                    <div class="info-row"><span>Nombre</span><strong>{{ loan()!.customer?.fullName }}</strong></div>
                    <div class="info-row"><span>CURP</span><strong class="font-mono">{{ loan()!.customer?.curp }}</strong></div>
                    <div class="info-row"><span>Teléfono</span><strong>{{ loan()!.customer?.phone }}</strong></div>                    
                  </div>
                  <div style="margin-top:12px">
                    <a mat-stroked-button [routerLink]="['/customers', loan()!.customerId]">
                      <mat-icon>person</mat-icon> Ver cliente
                    </a>
                  </div>
                </mat-card-content>
              </mat-card>
            </div>
          </div>
        </mat-tab>

        <!-- TAB: CALENDARIO -->
        <mat-tab label="Calendario de pagos">
          <div class="tab-content">
            @if (!loan()!.disbursedAt) {
              <div class="alert-box info">
                <mat-icon>info</mat-icon>
                <span>El calendario se genera al desembolsar el préstamo.</span>
              </div>
            } @else if (schedules().length === 0) {
              <div class="empty-state"><mat-icon>calendar_today</mat-icon><p>Sin calendario generado</p></div>
            } @else {
              <mat-card>
                <table mat-table [dataSource]="schedules()">

                  <ng-container matColumnDef="periodo">
                    <th mat-header-cell *matHeaderCellDef>#</th>
                    <td mat-cell *matCellDef="let s">{{ s.periodNumber }}</td>
                  </ng-container>

                  <ng-container matColumnDef="vence">
                    <th mat-header-cell *matHeaderCellDef>Vence</th>
                    <td mat-cell *matCellDef="let s">
                      <div>{{ s.dueDate | date:'EEE dd/MM/yyyy':'UTC' }}</div>
                      @if (daysOverdue(s) > 0 && s.status !== 'PAGADO') {
                        <div class="overdue-badge">{{ daysOverdue(s) }} días vencido</div>
                      }
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="total">
                    <th mat-header-cell *matHeaderCellDef>Cuota</th>
                    <td mat-cell *matCellDef="let s">{{ s.totalDue | currency:'MXN' }}</td>
                  </ng-container>

                  <!-- Mora REGISTRADA en la cuota (persiste aunque se pague) -->
                  <ng-container matColumnDef="moratorio">
                    <th mat-header-cell *matHeaderCellDef>Moratorio</th>
                    <td mat-cell *matCellDef="let s">
                      @if (moraGen(s) > 0) {
                        <div class="mora-cell">
                          <span class="mora-gen">{{ moraGen(s) | currency:'MXN' }}</span>
                          @if (moraPag(s) > 0) {
                            <span class="mora-pag" matTooltip="Mora pagada">pagada: {{ moraPag(s) | currency:'MXN' }}</span>
                          }
                          @if (moraPend(s) > 0) {
                            <span class="mora-pend" matTooltip="Mora pendiente">debe: {{ moraPend(s) | currency:'MXN' }}</span>
                          } @else {
                            <span class="mora-ok">saldada</span>
                          }
                        </div>
                      } @else { — }
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="estatus">
                    <th mat-header-cell *matHeaderCellDef>Estatus</th>
                    <td mat-cell *matCellDef="let s">
                      @if (daysOverdue(s) > 0 && s.status === 'PENDIENTE') {
                        <span class="badge badge-vencido">VENCIDO</span>
                      } @else {
                        <span class="badge badge-{{ s.status | lowercase }}">{{ s.status }}</span>
                      }
                    </td>
                  </ng-container>

                  <!-- Observaciones que el cobrador capturó al registrar el pago
                       (columna notas de la tabla pagos, cruzada por cuota) -->
                  <ng-container matColumnDef="observaciones">
                    <th mat-header-cell *matHeaderCellDef>Observaciones</th>
                    <td mat-cell *matCellDef="let s" class="obs-cell">
                      @if (s.notas) {
                        <span [matTooltip]="s.notas">{{ s.notas }}</span>
                      } @else { — }
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="scheduleCols"></tr>
                  <tr mat-row *matRowDef="let row; columns: scheduleCols;"
                      [class.overdue-row]="daysOverdue(row) > 0 && row.status === 'PENDIENTE'"
                      [class.paid-row]="row.status === 'PAGADO'"
                      [class.had-mora]="moraGen(row) > 0">
                  </tr>
                </table>
              </mat-card>
            }
          </div>
        </mat-tab>

        <!-- TAB: AVAL -->
        <mat-tab label="Aval">
          <div class="tab-content">
            <app-guarantor-form [loanId]="loan()!.id"></app-guarantor-form>
          </div>
        </mat-tab>

        <!-- TAB: DOCUMENTOS -->
        <mat-tab label="Documentos">
          <div class="tab-content">
            <mat-card>
              <mat-card-header>
                <mat-card-title><mat-icon>folder_open</mat-icon> Documento de garantía</mat-card-title>
                <mat-card-subtitle>Sube o reemplaza el documento que respalda el crédito</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <div class="garantia-section">
                  <div class="garantia-header">
                    <mat-icon style="color:#1C4532;font-size:36px;width:36px;height:36px">home_work</mat-icon>
                    <div>
                      <h3 style="margin:0;font-size:16px;font-weight:700">Documento de garantía</h3>
                      <p style="margin:4px 0 0;font-size:13px;color:#718096">
                        Escritura de terreno, título de propiedad, factura de vehículo, contrato u otro bien.
                      </p>
                    </div>
                  </div>

                  @if (existingDocs().length > 0) {
                    <div class="docs-existentes">
                      <h4 class="docs-title">Documentos cargados</h4>
                      @for (d of existingDocs(); track d.id) {
                        <div class="doc-item">
                          <mat-icon style="color:#16A34A">description</mat-icon>
                          <div class="doc-info">
                            <span class="doc-name">{{ d.nombre_archivo || d.tipo || 'Documento' }}</span>
                            @if (d.descripcion) { <span class="doc-desc">{{ d.descripcion }}</span> }
                          </div>
                          <button mat-icon-button color="primary" (click)="verDoc(d)"
                                  matTooltip="Ver documento">
                            <mat-icon>visibility</mat-icon>
                          </button>
                          @if (auth.can('prestamos.crear')) {
                            <button mat-icon-button color="warn" (click)="eliminarDoc(d)"
                                    matTooltip="Eliminar documento">
                              <mat-icon>delete_outline</mat-icon>
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }

                  <div class="desc-block">
                    <label class="desc-label">Descripción del bien en garantía</label>
                    <mat-form-field appearance="outline" class="w-full">
                      <textarea matInput rows="2"
                                [value]="garantiaDesc()"
                                (input)="garantiaDesc.set($any($event.target).value)"
                                placeholder="Ej: Terreno en Calle Juárez #45, Col. Centro, Ixtepec. Sup. 200m²">
                      </textarea>
                    </mat-form-field>
                  </div>

                  <div class="upload-zone" (click)="docInput.click()">
                    <mat-icon style="font-size:48px;width:48px;height:48px;color:#CBD5E0">cloud_upload</mat-icon>
                    <p style="margin:8px 0 4px;font-weight:600;color:#4A5568">Haz clic para seleccionar el archivo</p>
                    <p style="margin:0;font-size:12px;color:#718096">PDF, JPG, PNG — máximo 10 MB</p>
                    <input #docInput type="file" accept=".pdf,.jpg,.jpeg,.png"
                           style="display:none" (change)="uploadGarantia($event)">
                  </div>

                  @if (uploadingDoc()) {
                    <div style="display:flex;align-items:center;gap:8px;margin-top:12px;color:#718096">
                      <mat-spinner diameter="20"></mat-spinner>
                      <span>Subiendo documento...</span>
                    </div>
                  }
                </div>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-tab>

      </mat-tab-group>
    }
  `,
  styles: [`
    .overdue-badge {
      font-size: 10px; color: #DC2626; font-weight: 600;
      background: #FEE2E2; border-radius: 4px;
      padding: 1px 5px; margin-top: 2px; display: inline-block;
    }
    .overdue-row { background: #FFF5F5 !important; }
    .paid-row    { opacity: .55; }
    .had-mora    { background: #FFF7ED; }
    /* Celda de mora con generada / pagada / pendiente */
    .mora-cell { display:flex; flex-direction:column; gap:1px; }
    .obs-cell {
      max-width: 220px;
      font-size: 12px;
      color: #4A5568;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mora-gen  { color:#C2410C; font-weight:600; }
    .mora-pag  { font-size:10px; color:#16A34A; }
    .mora-pend { font-size:10px; color:#DC2626; font-weight:600; }
    .mora-ok   { font-size:10px; color:#16A34A; font-style:italic; }
    .garantia-header { display:flex; align-items:flex-start; gap:14px; }
    .upload-zone {
      border:2px dashed #CBD5E0; border-radius:12px; padding:28px;
      text-align:center; cursor:pointer; transition:.15s; margin-top:8px;
    }
    .upload-zone:hover { border-color:#1C4532; background:#F0FFF4; }
    .doc-item {
      display:flex; align-items:center; gap:10px; padding:10px 12px;
      background:#F7FAFC; border-radius:8px; margin-bottom:6px;
    }
    .doc-info { display:flex; flex-direction:column; flex:1; }
    .doc-name { font-weight:600; font-size:14px; }
    .doc-desc { font-size:12px; color:#718096; }
    .w-full { width:100%; }
    .docs-title { font-size:13px; color:#4A5568; margin:16px 0 8px; }
    .desc-block { margin:20px 0 4px; }
    .desc-label { display:block; font-size:13px; font-weight:600; color:#4A5568; margin-bottom:8px; }
    /* Monto editable con ícono de lápiz */
    .monto-editable { display:inline-flex; align-items:center; gap:2px; }
    .edit-monto-btn {
      width:28px; height:28px; line-height:28px; padding:0;
    }
    .edit-monto-btn mat-icon {
      font-size:16px; width:16px; height:16px; color:#C2410C;
    }
  `],
})
export class LoanDetailComponent implements OnInit {
  readonly auth = inject(AuthService);
  private route    = inject(ActivatedRoute);
  private router   = inject(Router);
  private api      = inject(ApiService);
  private snackbar = inject(MatSnackBar);
  private pdfSvc   = inject(PdfDownloadService);
  private http     = inject(HttpClient);
  private dialog   = inject(MatDialog);

  loan      = signal<Loan | null>(null);
  schedules = signal<PaymentSchedule[]>([]);

  // Cuotas que aún no están pagadas (para habilitar la renovación anticipada).
  cuotasPendientes = computed(
    () => this.schedules().filter((s) => s.status !== 'PAGADO').length,
  );

  // Se puede renovar si el crédito está LIQUIDADO o le quedan 3 o menos cuotas.
  puedeRenovar = computed(() => {
    const l = this.loan();
    if (!l) return false;
    if (l.status === 'LIQUIDADO') return true;
    const pend = this.cuotasPendientes();
    return pend > 0 && pend <= 3;
  });
  loading   = signal(true);
  scheduleCols = ['periodo', 'vence', 'total', 'moratorio', 'estatus', 'observaciones'];

  // Documentos de garantía
  existingDocs = signal<any[]>([]);
  garantiaDesc = signal('');
  uploadingDoc = signal(false);

  freq2unit(f: string): string {
    return {DIARIO:'días',SEMANAL:'semanas',QUINCENAL:'quincenas',MENSUAL:'meses'}[f] ?? 'períodos';
  }

  // Días de atraso de una cuota.
  // Se compara en el día-calendario de México (UTC-6) para ser consistente
  // con cómo el backend generó las fechas de vencimiento (medianoche UTC).
  daysOverdue(s: any): number {
    if (s.status === 'PAGADO') return 0;
    const MX = 6 * 60 * 60 * 1000;
    // La fecha de vencimiento ya está anclada a medianoche UTC (día-calendario
    // de México), así que NO se le aplica el offset. Solo a 'now'.
    const due = new Date(s.dueDate);
    const dueUTC = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
    const now = new Date();
    const nowDay = new Date(now.getTime() - MX);
    const todayUTC = Date.UTC(nowDay.getUTCFullYear(), nowDay.getUTCMonth(), nowDay.getUTCDate());
    const diff = Math.floor((todayUTC - dueUTC) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  // ── MORA REGISTRADA en la cuota (persiste aunque la cuota se pague) ──
  // Lee los campos reales moraGenerada/moraPagada que el backend guarda,
  // en vez de recalcular por días vencidos (que daría 0 al pagar la cuota).
  moraGen(s: any): number  { return Number(s.moraGenerada || 0); }
  moraPag(s: any): number  { return Number(s.moraPagada || 0); }
  moraPend(s: any): number { return Math.max(0, this.moraGen(s) - this.moraPag(s)); }

  // Totales de mora del crédito (para el panel de Información)
  totalMoraGenerada(): number {
    return Math.round(this.schedules().reduce((sum, s) => sum + this.moraGen(s), 0) * 100) / 100;
  }
  totalMoraPagada(): number {
    return Math.round(this.schedules().reduce((sum, s) => sum + this.moraPag(s), 0) * 100) / 100;
  }
  totalMoraPendiente(): number {
    return Math.round((this.totalMoraGenerada() - this.totalMoraPagada()) * 100) / 100;
  }

  // Monto fijo por día del tipo de préstamo
  latePerDay(): number {
    return Number((this.loan()?.loanType as any)?.lateFeeFixedAmount || 0);
  }

  ngOnInit() { this.load(); }

  load() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loading.set(true);
    this.api.get<Loan>('/loans/' + id).subscribe({
      next: (l) => {
        this.loan.set(l);
        this.loading.set(false);
        if (l.disbursedAt) this.loadSchedule(id);
        this.loadDocs(id);
      },
      error: () => this.loading.set(false),
    });
  }

  loadSchedule(id: string) {
    this.api.get<any>('/loans/' + id + '/schedule').subscribe({
      next: (s) => this.schedules.set(Array.isArray(s) ? s : s?.data ?? []),
    });
  }

  // ── Editar monto (corrección de carga) ──
  editarMonto() {
    const l = this.loan();
    if (!l) return;

    const ref = this.dialog.open(EditMontoDialogComponent, {
      width: '420px',
      data: {
        loanId: l.id,
        principalAmount: Number(l.principalAmount || 0),
        totalAmount: Number(l.totalAmount || 0),
      } as EditMontoData,
    });

    ref.afterClosed().subscribe((res) => {
      if (!res) return;  // canceló
      this.api.patch<Loan>('/loans/' + l.id + '/monto', {
        principalAmount: res.principalAmount,
        totalAmount: res.totalAmount,
      }).subscribe({
        next: (actualizado) => {
          // Refrescar el crédito en pantalla con lo que devuelva el backend.
          this.loan.set(actualizado ?? { ...l, ...res });
          this.snackbar.open('Monto actualizado', 'OK', { duration: 3000 });
        },
        error: (err: any) => {
          const msg = err?.status === 403
            ? 'No tienes permiso para editar el monto'
            : (err.error?.message || 'No se pudo actualizar el monto');
          this.snackbar.open(msg, 'Cerrar', { duration: 5000 });
        },
      });
    });
  }

  authorize(decision: 'APPROVE' | 'REJECT') {
    const id = this.loan()!.id;
    const rejectionReason = decision === 'REJECT' ? prompt('Motivo de rechazo:') : undefined;
    this.api.post<any>('/loans/' + id + '/authorize', { decision, rejectionReason }).subscribe({
      next: () => {
        this.snackbar.open(decision === 'APPROVE' ? 'Préstamo autorizado' : 'Rechazado', 'OK', { duration: 4000 });
        this.load();
        if (decision === 'APPROVE') setTimeout(() => this.downloadPlanPdf(), 1000);
      },
      error: (err: any) => this.snackbar.open(err.error?.message || 'Error', 'Cerrar', { duration: 5000 }),
    });
  }

  disburse() {
    const id = this.loan()!.id;
    this.api.post('/loans/' + id + '/disburse', { disbursementMethod: 'EFECTIVO' }).subscribe({
      next: () => {
        this.snackbar.open('Desembolso registrado', 'OK', { duration: 4000 });
        this.load();
        setTimeout(() => this.downloadContractPdf(), 1500);
      },
      error: (err: any) => this.snackbar.open(err.error?.message || 'Error', 'Cerrar', { duration: 5000 }),
    });
  }

  downloadPlanPdf() {
    const l = this.loan();
    if (!l) return;
    if (l.disbursedAt) {
      this.pdfSvc.open('/loans/' + l.id + '/pdf');
      return;
    }
    this.pdfSvc.downloadPost('/loans/simulate/pdf', 'plan-pagos-' + l.id.substring(0,8) + '.pdf', {
      principalAmount: l.principalAmount,
      days:            l.termWeeks,
      customPayment:   l.periodicPayment,
      customerName:    l.customer?.fullName,
    });
  }

  downloadContractPdf() {
    const l = this.loan();
    if (!l?.id) return;
    this.pdfSvc.open('/loans/' + l.id + '/pdf');
  }

  downloadControlCard() {
    const l = this.loan();
    if (!l?.id) return;
    this.pdfSvc.open('/loans/' + l.id + '/control-card');
  }

  loadDocs(loanId: string) {
    this.api.get<any>('/loans/' + loanId + '/documents').subscribe({
      next: (r) => this.existingDocs.set(Array.isArray(r) ? r : r?.data ?? []),
      error: () => this.existingDocs.set([]),
    });
  }

  uploadGarantia(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    const loanId = this.loan()?.id;
    if (!file || !loanId) return;

    this.uploadingDoc.set(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', 'garantia');
    formData.append('fileName', file.name);
    if (this.garantiaDesc()) formData.append('description', this.garantiaDesc());

    const token = localStorage.getItem('access_token');
    this.http.post(
      '/api/v1/loans/' + loanId + '/documents',
      formData,
      { headers: new HttpHeaders({ Authorization: 'Bearer ' + token }) }
    ).subscribe({
      next: () => {
        this.uploadingDoc.set(false);
        this.snackbar.open('Documento de garantía subido', 'OK', { duration: 3000 });
        this.loadDocs(loanId);
        this.garantiaDesc.set('');
      },
      error: () => {
        this.uploadingDoc.set(false);
        this.snackbar.open('Error al subir el documento', 'Cerrar', { duration: 4000 });
      },
    });
  }

  eliminarDoc(d: any) {
    if (!d?.id) return;
    if (!confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
    this.api.delete('/loans/documents/' + d.id).subscribe({
      next: () => {
        this.snackbar.open('Documento eliminado', 'OK', { duration: 3000 });
        const loanId = this.loan()?.id;
        if (loanId) this.loadDocs(loanId);
      },
      error: (err) => {
        const msg = err?.status === 403
          ? 'No tienes permiso para eliminar documentos'
          : (err.error?.message || 'Error al eliminar');
        this.snackbar.open(msg, 'Cerrar', { duration: 4000 });
      },
    });
  }

  verDoc(d: any) {
    if (!d?.id) {
      this.snackbar.open('No se pudo abrir el documento', 'Cerrar', { duration: 4000 });
      return;
    }
    this.pdfSvc.open('/loans/documents/' + d.id + '/file');
  }

  renovar() {
    const l = this.loan();
    if (l?.id) this.router.navigate(['/loans', l.id, 'renovar']);
  }

  convenio() {
    const l = this.loan();
    if (l?.id) this.router.navigate(['/loans', l.id, 'convenio']);
  }
}