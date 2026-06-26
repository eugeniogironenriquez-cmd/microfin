import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
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
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ApiService, AuthService, Loan, PaymentSchedule } from '../../core/index';
import { PdfDownloadService } from '../../core/pdf-download.service';
import { GuarantorFormComponent } from './guarantor-form.component';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, RouterLink,
    MatCardModule, MatButtonModule, MatIconModule, MatTabsModule,
    MatTableModule, MatProgressSpinnerModule, MatSnackBarModule,
    MatDividerModule, MatChipsModule, MatTooltipModule, GuarantorFormComponent,
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
        @if (loan()?.status === 'LIQUIDADO' && auth.can('prestamos.reestructurar')) {
          <button mat-raised-button color="primary" (click)="renovar()">
            <mat-icon>autorenew</mat-icon> Renovar
          </button>
        }
        @if ((loan()?.status === 'VENCIDO' || loan()?.status === 'ATRASADO') && auth.can('prestamos.reestructurar')) {
          <button mat-stroked-button color="warn" (click)="convenio()">
            <mat-icon>handshake</mat-icon> Convenio
          </button>
        }
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
                    <div class="info-row"><span>Folio</span><strong class="font-mono">{{ loan()!.id.substring(0,8).toUpperCase() }}</strong></div>
                    <div class="info-row"><span>Estado</span>
                      <span class="badge badge-{{ loan()!.status | lowercase }}">{{ loan()!.status }}</span>
                    </div>
                    <div class="info-row"><span>Monto</span><strong>{{ loan()!.principalAmount | currency:'MXN' }}</strong></div>
                    <div class="info-row"><span>Plazo</span><strong>{{ loan()!.termWeeks }} días</strong></div>
                    <div class="info-row"><span>Cuota diaria</span><strong>{{ loan()!.periodicPayment | currency:'MXN' }}</strong></div>
                    <div class="info-row"><span>Total a pagar</span><strong>{{ loan()!.totalAmount | currency:'MXN' }}</strong></div>
                    @if (loan()!.disbursedAt) {
                      <div class="info-row"><span>Desembolso</span><strong>{{ loan()!.disbursedAt | date:'dd/MM/yyyy':'UTC' }}</strong></div>
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


                  <ng-container matColumnDef="moratorio">
                    <th mat-header-cell *matHeaderCellDef>Moratorio</th>
                    <td mat-cell *matCellDef="let s">
                      @if (mora(s) > 0) {
                        <span style="color:#DC2626;font-weight:600"
                              [matTooltip]="'$' + latePerDay() + '/día × ' + daysOverdue(s) + ' días'">
                          {{ mora(s) | currency:'MXN' }}
                        </span>
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

                  <tr mat-header-row *matHeaderRowDef="scheduleCols"></tr>
                  <tr mat-row *matRowDef="let row; columns: scheduleCols;"
                      [class.overdue-row]="daysOverdue(row) > 0 && row.status === 'PENDIENTE'"
                      [class.paid-row]="row.status === 'PAGADO'">
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

  loan      = signal<Loan | null>(null);
  schedules = signal<PaymentSchedule[]>([]);
  loading   = signal(true);
  scheduleCols = ['periodo', 'vence', 'total', 'moratorio', 'estatus'];

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

  // Monto fijo por día del tipo de préstamo
  latePerDay(): number {
    return Number((this.loan()?.loanType as any)?.lateFeeFixedAmount || 0);
  }

  // Moratorio calculado
  mora(s: any): number {
    const days = this.daysOverdue(s);
    if (days <= 0) return 0;
    // Respetar días de gracia
    const grace = Number((this.loan()?.loanType as any)?.graceDays || 0);
    const chargeable = Math.max(0, days - grace);
    return chargeable * this.latePerDay();
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
    // Si el crédito YA está desembolsado, el calendario real existe en la BD:
    // usamos el PDF del crédito (/loans/:id/pdf), que lee las cuotas reales.
    if (l.disbursedAt) {
      this.pdfSvc.open('/loans/' + l.id + '/pdf');
      return;
    }
    // Si AÚN no se desembolsa, no hay calendario real todavía: generamos una
    // proyección con el simulador, pasando la cuota REAL guardada del crédito
    // como customPayment para que respete la cuota ajustada (ej. $171.00) en
    // vez de recalcularla con la fórmula (ej. $170.67).
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

  // Cargar documentos ya subidos (si el backend lo soporta)
  loadDocs(loanId: string) {
    this.api.get<any>('/loans/' + loanId + '/documents').subscribe({
      next: (r) => this.existingDocs.set(Array.isArray(r) ? r : r?.data ?? []),
      error: () => this.existingDocs.set([]), // si no hay endpoint, simplemente no lista
    });
  }

  // Subir documento de garantía a este crédito (mismo patrón que la solicitud nueva)
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

  // Abrir/descargar un documento cargado.
  // Intenta varias formas según lo que devuelva el backend:
  //  - d.url / d.fileUrl: enlace directo → abrir en pestaña nueva
  //  - d.id: pedir el archivo al endpoint con el token (vía PdfDownloadService.open)
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
    // Endpoint real del backend: GET /loans/documents/:docId/file
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
