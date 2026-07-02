import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-payments-query',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatButtonToggleModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatDatepickerModule, MatNativeDateModule,
    MatTableModule, MatTooltipModule, MatProgressSpinnerModule, MatDialogModule,
  ],
  template: `
    <div class="page">
      <div class="head">
        <h1><mat-icon>manage_search</mat-icon> Consulta de pagos</h1>
      </div>

      <!-- Filtros -->
      <mat-card class="filtros">
        <mat-button-toggle-group [(ngModel)]="modo" (change)="onModoChange()" class="modo">
          <mat-button-toggle value="dia">Un día</mat-button-toggle>
          <mat-button-toggle value="rango">Rango</mat-button-toggle>
        </mat-button-toggle-group>

        @if (modo === 'dia') {
          <mat-form-field appearance="outline" class="f-date">
            <mat-label>Fecha</mat-label>
            <input matInput [matDatepicker]="dp1" [(ngModel)]="fechaDia">
            <mat-datepicker-toggle matSuffix [for]="dp1"></mat-datepicker-toggle>
            <mat-datepicker #dp1></mat-datepicker>
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline" class="f-date">
            <mat-label>Desde</mat-label>
            <input matInput [matDatepicker]="dp2" [(ngModel)]="fechaDesde">
            <mat-datepicker-toggle matSuffix [for]="dp2"></mat-datepicker-toggle>
            <mat-datepicker #dp2></mat-datepicker>
          </mat-form-field>
          <mat-form-field appearance="outline" class="f-date">
            <mat-label>Hasta</mat-label>
            <input matInput [matDatepicker]="dp3" [(ngModel)]="fechaHasta">
            <mat-datepicker-toggle matSuffix [for]="dp3"></mat-datepicker-toggle>
            <mat-datepicker #dp3></mat-datepicker>
          </mat-form-field>
        }

        <button mat-raised-button color="primary" (click)="consultar()" [disabled]="loading()">
          <mat-icon>search</mat-icon> Consultar
        </button>
      </mat-card>

      <!-- Resumen -->
      @if (pagos().length > 0) {
        <div class="totales">
          <div class="tot-card">
            <span class="tot-lbl">Pagos</span>
            <span class="tot-val">{{ pagos().length }}</span>
          </div>
          <div class="tot-card">
            <span class="tot-lbl">Total cobrado</span>
            <span class="tot-val">{{ totalCobrado() | currency:'MXN':'symbol':'1.2-2' }}</span>
          </div>
        </div>
      }

      <!-- Tabla -->
      <mat-card class="tabla-card">
        @if (loading()) {
          <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
        } @else if (pagos().length === 0) {
          <div class="empty">
            <mat-icon>receipt_long</mat-icon>
            <p>{{ consultado() ? 'No hay pagos en el período seleccionado.' : 'Elige una fecha y consulta.' }}</p>
          </div>
        } @else {
          <table mat-table [dataSource]="pagos()" class="tabla">
            <ng-container matColumnDef="fecha">
              <th mat-header-cell *matHeaderCellDef>Fecha y hora</th>
              <td mat-cell *matCellDef="let p">{{ fmtFecha(p.paymentDate || p.createdAt) }}</td>
            </ng-container>
            <ng-container matColumnDef="cliente">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let p">{{ p.loan?.customer?.fullName || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="folio">
              <th mat-header-cell *matHeaderCellDef>Folio</th>
              <td mat-cell *matCellDef="let p">{{ p.receiptNumber || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="metodo">
              <th mat-header-cell *matHeaderCellDef>Forma</th>
              <td mat-cell *matCellDef="let p">{{ p.method }}</td>
            </ng-container>
            <ng-container matColumnDef="monto">
              <th mat-header-cell *matHeaderCellDef class="r">Monto</th>
              <td mat-cell *matCellDef="let p" class="r mono">{{ p.amountPaid | currency:'MXN':'symbol':'1.2-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef class="r">Acciones</th>
              <td mat-cell *matCellDef="let p" class="r">
                <button mat-icon-button (click)="verDetalle(p)" matTooltip="Ver detalle">
                  <mat-icon>visibility</mat-icon>
                </button>
                <button mat-icon-button color="primary" (click)="printTicket(p.id)" matTooltip="Reimprimir ticket (80mm)">
                  <mat-icon>receipt_long</mat-icon>
                </button>
                <button mat-icon-button (click)="downloadReceipt(p.id)" matTooltip="Comprobante (carta)">
                  <mat-icon>description</mat-icon>
                </button>
                <button mat-icon-button class="wa" (click)="compartirWhatsApp(p)"
                        [disabled]="!telefonoDe(p)"
                        [matTooltip]="telefonoDe(p) ? 'Enviar por WhatsApp' : 'Sin teléfono'">
                  <mat-icon>share</mat-icon>
                </button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>
          </table>
        }
      </mat-card>
    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 1150px; margin: 0 auto; }
    .head h1 { display:flex; align-items:center; gap:10px; font-size:22px; color:#0d3a52; margin:0 0 18px; }
    .filtros { display:flex; align-items:center; gap:14px; padding:16px; flex-wrap:wrap; margin-bottom:16px; }
    .modo { height:40px; }
    .f-date { width:180px; margin-bottom:-1.25em; }
    .totales { display:flex; gap:14px; margin-bottom:16px; }
    .tot-card { background:#fff; border-radius:12px; padding:14px 20px; box-shadow:0 1px 3px rgba(0,0,0,.08); display:flex; flex-direction:column; }
    .tot-lbl { font-size:12px; color:#718096; }
    .tot-val { font-size:24px; font-weight:700; color:#0d3a52; }
    .tabla-card { padding:0; overflow:hidden; }
    .tabla { width:100%; }
    .center { display:flex; justify-content:center; padding:48px; }
    .empty { text-align:center; padding:48px; color:#718096; }
    .empty mat-icon { font-size:48px; width:48px; height:48px; color:#e2e8f0; }
    .r { text-align:right; }
    .mono { font-variant-numeric:tabular-nums; font-weight:600; }
    .wa:not([disabled]) mat-icon { color:#25D366; }
  `],
})
export class PaymentsQueryComponent implements OnInit {
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  private snackbar = inject(MatSnackBar);
  private base = environment.apiUrl;

  cols = ['fecha', 'cliente', 'folio', 'metodo', 'monto', 'acciones'];
  modo: 'dia' | 'rango' = 'dia';
  fechaDia: Date = new Date();
  fechaDesde: Date = new Date();
  fechaHasta: Date = new Date();

  loading = signal(false);
  consultado = signal(false);
  pagos = signal<any[]>([]);

  totalCobrado = computed(() =>
    this.pagos().reduce((s, p) => s + Number(p.amountPaid || 0), 0),
  );

  ngOnInit() {}

  onModoChange() {
    this.pagos.set([]);
    this.consultado.set(false);
  }

  private toISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async consultar() {
    let from: string, to: string | undefined;
    if (this.modo === 'dia') {
      if (!this.fechaDia) { this.snackbar.open('Elige una fecha', 'Cerrar', { duration: 3000 }); return; }
      from = this.toISO(this.fechaDia);
    } else {
      if (!this.fechaDesde || !this.fechaHasta) { this.snackbar.open('Elige ambas fechas', 'Cerrar', { duration: 3000 }); return; }
      from = this.toISO(this.fechaDesde);
      to = this.toISO(this.fechaHasta);
      if (to < from) { this.snackbar.open('La fecha final no puede ser anterior', 'Cerrar', { duration: 3500 }); return; }
    }

    this.loading.set(true);
    try {
      const params: any = { from };
      if (to) params.to = to;
      const qs = new URLSearchParams(params).toString();
      const res = await firstValueFrom(this.http.get<any>(`${this.base}/payments/by-range?${qs}`));
      const data = res?.data ?? res;
      this.pagos.set(Array.isArray(data) ? data : []);
      this.consultado.set(true);
    } catch {
      this.snackbar.open('No se pudo consultar', 'Cerrar', { duration: 4000 });
      this.pagos.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Detalle ──
  verDetalle(p: any) {
    this.dialog.open(PaymentDetailDialog, { data: p, width: '440px' });
  }

  // ── Reimpresión / comprobante (mismo patrón del monitor) ──
  async printTicket(id: string) {
    try {
      const blob = await firstValueFrom(
        this.http.get(`${this.base}/payments/${id}/ticket`, { responseType: 'blob' }),
      );
      const url = URL.createObjectURL(blob);
      const w = window.open(url);
      if (w) w.onload = () => w.print();
    } catch {
      this.snackbar.open('No se pudo generar el ticket', 'Cerrar', { duration: 4000 });
    }
  }

  async downloadReceipt(id: string) {
    try {
      const blob = await firstValueFrom(
        this.http.get(`${this.base}/payments/${id}/receipt`, { responseType: 'blob' }),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      this.snackbar.open('No se pudo descargar el comprobante', 'Cerrar', { duration: 4000 });
    }
  }

  // ── WhatsApp (mismo formato del monitor) ──
  telefonoDe(p: any): string | null {
    const raw = p?.loan?.customer?.phone;
    if (!raw) return null;
    const d = String(raw).replace(/\D/g, '');
    return d.length >= 10 ? d : null;
  }
  private waNumero(p: any): string | null {
    const tel = this.telefonoDe(p);
    if (!tel) return null;
    if (tel.length === 12 && tel.startsWith('52')) return tel;
    if (tel.length === 10) return '52' + tel;
    return tel;
  }
  private textoTicket(p: any): string {
    const money = (v: any) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cliente = p?.loan?.customer?.fullName || 'Cliente';
    const folio = p?.receiptNumber || (p?.id ? p.id.substring(0, 8).toUpperCase() : '—');
    const fh = this.fmtFecha(p?.paymentDate || p?.createdAt);
    const L: string[] = [];
    L.push('*MICROCAPITAL - IXTEPEC*');
    L.push('COMPROBANTE DE PAGO');
    L.push('--------------------------------');
    L.push(`Folio: ${folio}`);
    L.push(`Cliente: ${cliente}`);
    L.push('--------------------------------');
    if (p?.capitalApplied != null)  L.push(`Capital: ${money(p.capitalApplied)}`);
    if (p?.interestApplied != null) L.push(`Interés: ${money(p.interestApplied)}`);
    if (Number(p?.lateInterestApplied || 0) > 0) L.push(`Moratorio: ${money(p.lateInterestApplied)}`);
    L.push('--------------------------------');
    L.push(`*TOTAL RECIBIDO: ${money(p?.amountPaid)}*`);
    if (p?.method) L.push(`Forma de pago: ${p.method}`);
    L.push(`Fecha y hora: ${fh}`);
    L.push('--------------------------------');
    L.push('Gracias por su pago.');
    return L.join('\n');
  }
  compartirWhatsApp(p: any) {
    const numero = this.waNumero(p);
    if (!numero) { this.snackbar.open('El cliente no tiene teléfono válido', 'Cerrar', { duration: 4000 }); return; }
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(this.textoTicket(p))}`, '_blank');
  }

  fmtFecha(iso: string): string {
    try {
      return new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(iso)).replace(',', '');
    } catch { return iso; }
  }
}

// ─── Diálogo de detalle ───────────────────────────────────────
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Inject } from '@angular/core';

@Component({
  selector: 'payment-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Detalle del pago</h2>
    <mat-dialog-content>
      <div class="row"><span>Folio</span><strong>{{ p.receiptNumber || '—' }}</strong></div>
      <div class="row"><span>Cliente</span><strong>{{ p.loan?.customer?.fullName || '—' }}</strong></div>
      <div class="row"><span>Fecha</span><strong>{{ fmt(p.paymentDate || p.createdAt) }}</strong></div>
      <div class="row"><span>Forma de pago</span><strong>{{ p.method }}</strong></div>
      <hr>
      <div class="row"><span>Capital</span><strong>{{ p.capitalApplied | currency:'MXN' }}</strong></div>
      <div class="row"><span>Interés</span><strong>{{ p.interestApplied | currency:'MXN' }}</strong></div>
      @if (num(p.lateInterestApplied) > 0) {
        <div class="row"><span>Moratorio</span><strong>{{ p.lateInterestApplied | currency:'MXN' }}</strong></div>
      }
      <div class="row total"><span>Total recibido</span><strong>{{ p.amountPaid | currency:'MXN' }}</strong></div>
      @if (cuotas().length > 0) {
        <hr>
        <div class="sub">Cuotas cubiertas</div>
        <div class="chips">
          @for (c of cuotas(); track $index) {
            <span class="chip">#{{ c }}</span>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .row { display:flex; justify-content:space-between; padding:5px 0; font-size:14px; }
    .row span { color:#718096; }
    .row.total strong { color:#0d3a52; font-size:16px; }
    hr { border:none; border-top:1px solid #edf2f7; margin:10px 0; }
    .sub { font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:#a0aec0; font-weight:600; margin-bottom:8px; }
    .chips { display:flex; flex-wrap:wrap; gap:6px; }
    .chip { background:#e6f3fa; color:#155777; border-radius:999px; padding:2px 10px; font-size:13px; font-weight:600; }
  `],
})
export class PaymentDetailDialog {
  constructor(@Inject(MAT_DIALOG_DATA) public p: any) {}

  num(v: any): number { return Number(v || 0); }

  cuotas(): number[] {
    const raw = this.p?.cuotasPagadas;
    if (!raw) return [];
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return [];
      // Puede ser [{periodo:..}] o [numeros]
      return arr.map((x: any) => (typeof x === 'object' ? (x.periodo ?? x.period ?? x) : x));
    } catch { return []; }
  }

  fmt(iso: string): string {
    try {
      return new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(iso)).replace(',', '');
    } catch { return iso; }
  }
}