import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
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
    MatDividerModule, MatChipsModule, GuarantorFormComponent,
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
      </div>
    </div>

    @if (loading()) {
      <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
    } @else if (loan()) {
      <mat-tab-group>

        <!-- TAB: INFORMACIÓN GENERAL -->
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
                    <div class="info-row"><span>Tasa</span><strong>{{ (loan()!.interestRate * 100).toFixed(2) }}%</strong></div>
                    <div class="info-row"><span>Plazo</span><strong>{{ loan()!.termWeeks }} semanas</strong></div>
                    <div class="info-row"><span>Frecuencia</span><strong>{{ loan()!.frequency }}</strong></div>
                    <div class="info-row"><span>Cuota</span><strong>{{ loan()!.periodicPayment | currency:'MXN' }}</strong></div>
                    <div class="info-row"><span>Total a pagar</span><strong>{{ loan()!.totalAmount | currency:'MXN' }}</strong></div>
                    @if (loan()!.disbursedAt) {
                      <div class="info-row"><span>Desembolso</span><strong>{{ loan()!.disbursedAt | date:'dd/MM/yyyy' }}</strong></div>
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
                    <div class="info-row"><span>Email</span><strong>{{ loan()!.customer?.email || '—' }}</strong></div>
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

        <!-- TAB: CALENDARIO DE PAGOS -->
        <mat-tab label="Calendario de pagos">
          <div class="tab-content">
            @if (schedules().length === 0 && loan()!.disbursedAt) {
              <div class="empty-state"><mat-icon>calendar_today</mat-icon><p>Sin calendario generado</p></div>
            } @else if (!loan()!.disbursedAt) {
              <div class="alert-box info">
                <mat-icon>info</mat-icon>
                <span>El calendario se genera al desembolsar el préstamo.</span>
              </div>
            } @else {
              <mat-card>
                <table mat-table [dataSource]="schedules()">
                  <ng-container matColumnDef="periodo">
                    <th mat-header-cell *matHeaderCellDef>#</th>
                    <td mat-cell *matCellDef="let s">{{ s.periodNumber }}</td>
                  </ng-container>
                  <ng-container matColumnDef="vence">
                    <th mat-header-cell *matHeaderCellDef>Vence</th>
                    <td mat-cell *matCellDef="let s">{{ s.dueDate | date:'dd/MM/yyyy' }}</td>
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
                      @if (s.lateInterest > 0) {
                        <span style="color:#DC2626">{{ s.lateInterest | currency:'MXN' }}</span>
                      } @else { — }
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="estatus">
                    <th mat-header-cell *matHeaderCellDef>Estatus</th>
                    <td mat-cell *matCellDef="let s">
                      <span class="badge badge-{{ s.status | lowercase }}">{{ s.status }}</span>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="scheduleCols"></tr>
                  <tr mat-row *matRowDef="let row; columns: scheduleCols;"></tr>
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
})
export class LoanDetailComponent implements OnInit {
  readonly auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private snackbar = inject(MatSnackBar);
  private pdfSvc = inject(PdfDownloadService);

  loan = signal<Loan | null>(null);
  schedules = signal<PaymentSchedule[]>([]);
  loading = signal(true);

  scheduleCols = ['periodo', 'vence', 'total', 'capital', 'interes', 'moratorio', 'estatus'];

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
    this.api.get<PaymentSchedule[]>('/loans/' + id + '/schedule').subscribe({
      next: (s) => this.schedules.set(s),
    });
  }

  authorize(decision: 'APPROVE' | 'REJECT') {
    const id = this.loan()!.id;
    const rejectionReason = decision === 'REJECT' ? prompt('Motivo de rechazo:') : undefined;
    this.api.post<any>('/loans/' + id + '/authorize', { decision, rejectionReason }).subscribe({
      next: () => {
        const msg = decision === 'APPROVE' ? 'Préstamo autorizado' : 'Préstamo rechazado';
        this.snackbar.open(msg, 'OK', { duration: 4000 });
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
    this.pdfSvc.downloadPost('/loans/simulate/pdf', 'plan-pagos-' + l.id.substring(0, 8) + '.pdf', {
      principalAmount: l.principalAmount,
      interestRate:    l.interestRate,
      termWeeks:       l.termWeeks,
      frequency:       l.frequency,
      customerName:    l.customer?.fullName,
    });
  }

  downloadContractPdf() {
    const l = this.loan();
    if (!l?.id) return;
    this.pdfSvc.open('/loans/' + l.id + '/pdf');
  }
}
