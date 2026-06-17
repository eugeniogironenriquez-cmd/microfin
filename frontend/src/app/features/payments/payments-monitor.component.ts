import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { interval, Subscription } from 'rxjs';
import { ApiService } from '../../core/index';
import { PdfDownloadService } from '../../core/pdf-download.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-payments-monitor',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe,
    MatCardModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTableModule, MatTooltipModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>monitor</mat-icon> Monitor de pagos del día</h1>
      <div class="header-actions">
        <button mat-stroked-button (click)="loadPayments()" [disabled]="loading()">
          <mat-icon>refresh</mat-icon> Actualizar
        </button>
        <button mat-raised-button color="primary" (click)="exportExcel()"
                [disabled]="payments().length === 0">
          <mat-icon>table_chart</mat-icon> Exportar Excel
        </button>
      </div>
    </div>

    <!-- KPI CARDS -->
    <div class="kpi-row">
      <div class="kpi kpi-green">
        <div class="kpi-left">
          <div class="kpi-label">Pagos registrados</div>
          <div class="kpi-value">{{ payments().length }}</div>
          <div class="kpi-sub">Hoy {{ today() }}</div>
        </div>
        <div class="kpi-icon"><mat-icon>payments</mat-icon></div>
      </div>
      <div class="kpi kpi-blue">
        <div class="kpi-left">
          <div class="kpi-label">Total cobrado</div>
          <div class="kpi-value">{{ totalCollected() | currency:'MXN':'symbol':'1.0-0' }}</div>
          <div class="kpi-sub">Capital + interés</div>
        </div>
        <div class="kpi-icon"><mat-icon>account_balance_wallet</mat-icon></div>
      </div>
      <div class="kpi kpi-amber">
        <div class="kpi-left">
          <div class="kpi-label">Moratorios</div>
          <div class="kpi-value">{{ totalLate() | currency:'MXN':'symbol':'1.0-0' }}</div>
          <div class="kpi-sub">Por atraso</div>
        </div>
        <div class="kpi-icon"><mat-icon>warning</mat-icon></div>
      </div>
      <div class="kpi kpi-purple">
        <div class="kpi-left">
          <div class="kpi-label">Clientes</div>
          <div class="kpi-value">{{ uniqueCustomers() }}</div>
          <div class="kpi-sub">Únicos atendidos</div>
        </div>
        <div class="kpi-icon"><mat-icon>people</mat-icon></div>
      </div>
    </div>

    <!-- Refresh info -->
    <div class="refresh-bar">
      <mat-icon>autorenew</mat-icon>
      <span>Actualiza cada 30 s · Última actualización: {{ lastRefresh() | date:'HH:mm:ss' }}</span>
    </div>

    <!-- Tabla -->
    @if (loading()) {
      <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
    } @else if (payments().length === 0) {
      <div class="empty-state">
        <mat-icon>payments</mat-icon>
        <p>Sin pagos registrados hoy</p>
      </div>
    } @else {
      <mat-card>
        <mat-card-content>
          <table mat-table [dataSource]="payments()">

            <!--<ng-container matColumnDef="hora">
              <th mat-header-cell *matHeaderCellDef>Hora</th>
              <td mat-cell *matCellDef="let r">
                <strong>{{ r.paymentDate | date:'HH:mm' }}</strong>
              </td>
            </ng-container>-->

            <ng-container matColumnDef="cliente">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let r">
                <div class="client-name">{{ r.loan?.customer?.fullName || '—' }}</div>
                <div class="client-sub">{{ r.loan?.customer?.phone }}</div>
              </td>
            </ng-container>

            <ng-container matColumnDef="monto">
              <th mat-header-cell *matHeaderCellDef>Monto</th>
              <td mat-cell *matCellDef="let r">
                <strong style="color:#1C4532">{{ r.amountPaid | currency:'MXN' }}</strong>
              </td>
            </ng-container>

            <!--<ng-container matColumnDef="capital">
              <th mat-header-cell *matHeaderCellDef>Capital</th>
              <td mat-cell *matCellDef="let r">{{ r.capitalApplied | currency:'MXN' }}</td>
            </ng-container>

            <ng-container matColumnDef="interes">
              <th mat-header-cell *matHeaderCellDef>Interés</th>
              <td mat-cell *matCellDef="let r">{{ r.interestApplied | currency:'MXN' }}</td>
            </ng-container>-->

            <ng-container matColumnDef="moratorio">
              <th mat-header-cell *matHeaderCellDef>Moratorio</th>
              <td mat-cell *matCellDef="let r">
                @if (r.lateInterestApplied > 0) {
                  <span style="color:#DC2626;font-weight:600">
                    {{ r.lateInterestApplied | currency:'MXN' }}
                  </span>
                } @else { — }
              </td>
            </ng-container>

            <ng-container matColumnDef="forma">
              <th mat-header-cell *matHeaderCellDef>Forma</th>
              <td mat-cell *matCellDef="let r">{{ r.method }}</td>
            </ng-container>

            <ng-container matColumnDef="folio">
              <th mat-header-cell *matHeaderCellDef>Folio</th>
              <td mat-cell *matCellDef="let r" style="font-size:11px;color:#718096">
                {{ r.receiptNumber || r.id?.substring(0,8).toUpperCase() }}
              </td>
            </ng-container>

            <ng-container matColumnDef="ticket">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let r">
                <button mat-icon-button (click)="downloadTicket(r.id)"
                        matTooltip="Descargar ticket">
                  <mat-icon>receipt</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>

            <!-- Fila de totales -->
            <tr class="totals-row">
              <td colspan="2"><strong>TOTALES</strong></td>
              <td><strong>{{ totalCollected() | currency:'MXN' }}</strong></td>
              <td>{{ totalCapital() | currency:'MXN' }}</td>
              <td>{{ totalInterest() | currency:'MXN' }}</td>
              <td style="color:#DC2626;font-weight:600">{{ totalLate() | currency:'MXN' }}</td>
              <td colspan="3"></td>
            </tr>
          </table>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: [`
    .header-actions { display:flex; gap:10px; }

    .kpi-row {
      display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:16px;
    }
    @media(max-width:900px){ .kpi-row { grid-template-columns:1fr 1fr; } }
    .kpi {
      border-radius:16px; padding:20px; display:flex;
      align-items:center; justify-content:space-between;
      box-shadow:0 6px 20px rgba(0,0,0,.12);
    }
    .kpi-green  { background:linear-gradient(135deg,#1C4532,#276749); }
    .kpi-blue   { background:linear-gradient(135deg,#4F7AF8,#6B5CE7); }
    .kpi-amber  { background:linear-gradient(135deg,#F59E0B,#D97706); }
    .kpi-purple { background:linear-gradient(135deg,#9B59B6,#6B5CE7); }
    .kpi-left { flex:1; }
    .kpi-label { font-size:12px; color:rgba(255,255,255,.75); margin-bottom:4px; }
    .kpi-value { font-size:28px; font-weight:700; color:#fff; line-height:1; margin-bottom:6px; }
    .kpi-sub   { font-size:11px; color:rgba(255,255,255,.6); }
    .kpi-icon  {
      width:44px; height:44px; border-radius:12px;
      background:rgba(255,255,255,.15); display:flex;
      align-items:center; justify-content:center;
    }
    .kpi-icon mat-icon { color:#fff !important; font-size:22px; width:22px; height:22px; }

    .refresh-bar {
      display:flex; align-items:center; gap:6px; font-size:12px;
      color:#718096; margin-bottom:12px;
    }
    .refresh-bar mat-icon { font-size:16px; width:16px; height:16px; }

    .client-name { font-weight:600; font-size:13px; }
    .client-sub  { font-size:11px; color:#718096; }

    .totals-row td {
      padding: 10px 16px; font-size:13px;
      border-top: 2px solid #1C4532;
      background: #F0FFF4;
    }
  `],
})
export class PaymentsMonitorComponent implements OnInit, OnDestroy {
  private api     = inject(ApiService);
  private pdfSvc  = inject(PdfDownloadService);
  private snackbar = inject(MatSnackBar);

  payments    = signal<any[]>([]);
  loading     = signal(true);
  lastRefresh = signal<Date>(new Date());

  cols = ['cliente','monto','moratorio','forma','folio','ticket'];

  private sub?: Subscription;

  today = () => new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long' });
  totalCollected  = () => this.payments().reduce((s,p) => s + Number(p.amountPaid), 0);
  totalCapital    = () => this.payments().reduce((s,p) => s + Number(p.capitalApplied || 0), 0);
  totalInterest   = () => this.payments().reduce((s,p) => s + Number(p.interestApplied || 0), 0);
  totalLate       = () => this.payments().reduce((s,p) => s + Number(p.lateInterestApplied || 0), 0);
  uniqueCustomers = () => new Set(this.payments().map(p => p.loan?.customerId)).size;

  ngOnInit() {
    this.loadPayments();
    this.sub = interval(30000).subscribe(() => this.loadPayments());
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  loadPayments() {
    this.loading.set(true);
    this.api.get<any>('/payments/today').subscribe({
      next: (r) => {
        this.payments.set(Array.isArray(r) ? r : r?.data ?? []);
        this.lastRefresh.set(new Date());
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  downloadTicket(id: string) {
    this.pdfSvc.download(`/payments/${id}/receipt`, `ticket-${id.substring(0,8)}.pdf`);
  }

  exportExcel() {
    const fecha    = new Date().toISOString().split('T')[0];
    const fechaLeg = new Date().toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const cur      = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits:2, maximumFractionDigits:2 });

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
        <x:ExcelWorksheet><x:Name>Pagos del día</x:Name>
        <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <style>
        body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
        .title {
          background: #1C4532; color: #ffffff;
          font-size: 16pt; font-weight: bold;
          text-align: center; padding: 10px;
        }
        .subtitle {
          background: #276749; color: #d1fae5;
          font-size: 10pt; text-align: center; padding: 6px;
        }
        .meta {
          background: #F0FFF4; color: #1C4532;
          font-size: 9pt; text-align: center; padding: 4px;
          border-bottom: 2px solid #1C4532;
        }
        .spacer { height: 8px; }
        th {
          background: #1C4532; color: #ffffff;
          font-weight: bold; font-size: 10pt;
          padding: 8px 10px; text-align: center;
          border: 1px solid #0d2b1e;
        }
        td {
          padding: 6px 10px; font-size: 10pt;
          border: 1px solid #CBD5E0; vertical-align: middle;
        }
        .row-even { background: #F0FFF4; }
        .row-odd  { background: #ffffff; }
        .col-num  { text-align: right; font-family: Consolas, monospace; }
        .col-mora { text-align: right; color: #DC2626; font-weight: 600; font-family: Consolas, monospace; }
        .col-hora { text-align: center; font-weight: 600; color: #1C4532; }
        .col-folio{ font-family: Consolas, monospace; font-size: 9pt; color: #718096; }
        .totals td {
          background: #1C4532; color: #ffffff;
          font-weight: bold; font-size: 10pt;
          border: 1px solid #0d2b1e;
        }
        .totals .col-label {
          text-align: left; letter-spacing: 1px;
        }
        table { border-collapse: collapse; width: 100%; }
      </style>
      </head><body>
      <table>
        <tr><td colspan="6" class="title">REPORTE DE PAGOS DEL DÍA — MICROCAPITAL IXTEPEC</td></tr>
        <tr><td colspan="6" class="subtitle">${fechaLeg}</td></tr>
        <tr><td colspan="6" class="meta">
          Total de pagos: ${this.payments().length} &nbsp;|&nbsp;
          Total cobrado: ${cur(this.totalCollected())} &nbsp;|&nbsp;
          Moratorio: ${cur(this.totalLate())}
        </td></tr>
        <tr class="spacer"><td colspan="6"></td></tr>
        <tr>
          <th>Cliente</th><th>Teléfono</th>
          <th>Monto recibido</th>
          <th>Moratorio</th><th>Forma de pago</th><th>Folio</th>
        </tr>
        ${this.payments().map((p, i) => `
        <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
          <td><b>${p.loan?.customer?.fullName || '—'}</b></td>
          <td>${p.loan?.customer?.phone || '—'}</td>
          <td class="col-num">${cur(Number(p.amountPaid))}</td>
          <td class="${Number(p.lateInterestApplied||0) > 0 ? 'col-mora' : 'col-num'}">
            ${Number(p.lateInterestApplied||0) > 0 ? cur(Number(p.lateInterestApplied)) : '—'}
          </td>
          <td style="text-align:center">${p.method || 'EFECTIVO'}</td>
          <td class="col-folio">${p.receiptNumber || p.id?.substring(0,8).toUpperCase()}</td>
        </tr>`).join('')}
        <tr class="totals">
          <td class="col-label" colspan="2">TOTALES</td>
          <td class="col-num">${cur(this.totalCollected())}</td>
          <td class="col-num">${cur(this.totalLate())}</td>
          <td colspan="2"></td>
        </tr>
      </table>
      </body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `reporte-pagos-${fecha}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    this.snackbar.open('Reporte exportado correctamente', 'OK', { duration: 2000 });
  }
}