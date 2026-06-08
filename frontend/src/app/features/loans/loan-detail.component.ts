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
        @if (loan()?.status === 'SOLICITUD' && auth.hasRole('AUTORIZADOR','ADMIN')) {
          <button mat-raised-button color="primary" (click)="authorize('APPROVE')">
            <mat-icon>check_circle</mat-icon> Autorizar
          </button>
          <button mat-raised-button color="warn" (click)="authorize('REJECT')">
            <mat-icon>cancel</mat-icon> Rechazar
          </button>
        }
        @if (loan()?.status === 'AUTORIZADO' && auth.hasRole('ADMIN','CAJERO')) {
          <button mat-raised-button color="primary" (click)="disburse()">
            <mat-icon>payments</mat-icon> Desembolsar
          </button>
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
        @if ((loan()?.status === 'ACTIVO' || loan()?.status === 'VENCIDO') && auth.can('prestamos.reestructurar')) {
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
                    <div class="info-row"><span>Tipo</span><strong>{{ loan()!.loanType?.name }}</strong></div>
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

                  <ng-container matColumnDef="capital">
                    <th mat-header-cell *matHeaderCellDef>Capital</th>
                    <td mat-cell *matCellDef="let s">{{ s.principalDue | currency:'MXN' }}</td>
                  </ng-container>

                  <ng-container matColumnDef="interes">
                    <th mat-header-cell *matHeaderCellDef>Interés</th>
                    <td mat-cell *matCellDef="let s">{{ s.interestDue | currency:'MXN' }}</td>
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
  `],
})
export class LoanDetailComponent implements OnInit {
  readonly auth = inject(AuthService);
  private route    = inject(ActivatedRoute);
  private router   = inject(Router);
  private api      = inject(ApiService);
  private snackbar = inject(MatSnackBar);
  private pdfSvc   = inject(PdfDownloadService);

  loan      = signal<Loan | null>(null);
  schedules = signal<PaymentSchedule[]>([]);
  loading   = signal(true);
  scheduleCols = ['periodo', 'vence', 'total', 'capital', 'interes', 'moratorio', 'estatus'];

  freq2unit(f: string): string {
    return {DIARIO:'días',SEMANAL:'semanas',QUINCENAL:'quincenas',MENSUAL:'meses'}[f] ?? 'períodos';
  }

  // Días de atraso de una cuota.
  // Se compara en el día-calendario de México (UTC-6) para ser consistente
  // con cómo el backend generó las fechas de vencimiento (medianoche UTC).
  daysOverdue(s: any): number {
    if (s.status === 'PAGADO') return 0;
    const MX = 6 * 60 * 60 * 1000;
    const due = new Date(s.dueDate);
    const dueDay = new Date(due.getTime() - MX);
    const dueUTC = Date.UTC(dueDay.getUTCFullYear(), dueDay.getUTCMonth(), dueDay.getUTCDate());
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
    const totalRate = Number((l as any).totalRate || 0);
    this.pdfSvc.downloadPost('/loans/simulate/pdf', 'plan-pagos-' + l.id.substring(0,8) + '.pdf', {
      principalAmount: l.principalAmount,
      days:            l.termWeeks,
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

  renovar() {
    const l = this.loan();
    if (l?.id) this.router.navigate(['/loans', l.id, 'renovar']);
  }

  convenio() {
    const l = this.loan();
    if (l?.id) this.router.navigate(['/loans', l.id, 'convenio']);
  }
}