import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/index';

/** Fecha de hoy en zona de México (YYYY-MM-DD). */
function hoyMexico(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Primer día del mes actual (YYYY-MM-DD) en zona de México. */
function inicioMesMexico(): string {
  return `${hoyMexico().slice(0, 7)}-01`;
}

/** '2026-03-14' -> 'vie 14 mar 2026' para el encabezado de cada día. */
function labelDia(iso: string): string {
  if (!iso) return '';
  // Se fuerza UTC porque el string ya es date-only; evita recorrer el día.
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('es-MX', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'America/Mexico_City',
  });
}

@Component({
  selector: 'app-collector-cash',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatTableModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1><mat-icon>account_balance</mat-icon> Corte de caja por cobrador</h1>
        <p class="sub">Cobros por día y efectivo a entregar por cada cobrador</p>
      </div>
    </div>

    <!-- Filtro de periodo -->
    <mat-card class="filtros">
      <form [formGroup]="filtroForm" (ngSubmit)="cargar()" class="filtro-row">
        <mat-form-field appearance="outline" class="f-date">
          <mat-label>Desde</mat-label>
          <input matInput [matDatepicker]="dp1" formControlName="start">
          <mat-datepicker-toggle matSuffix [for]="dp1"></mat-datepicker-toggle>
          <mat-datepicker #dp1></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline" class="f-date">
          <mat-label>Hasta</mat-label>
          <input matInput [matDatepicker]="dp2" formControlName="end">
          <mat-datepicker-toggle matSuffix [for]="dp2"></mat-datepicker-toggle>
          <mat-datepicker #dp2></mat-datepicker>
        </mat-form-field>

        <button mat-raised-button color="primary" type="submit" [disabled]="loading()">
          <mat-icon>refresh</mat-icon> Actualizar
        </button>

        <button mat-stroked-button type="button" (click)="hoy()">Hoy</button>
        <button mat-stroked-button type="button" (click)="esteMes()">Este mes</button>

        <span class="spacer"></span>

        <button mat-raised-button color="accent" type="button"
                (click)="exportar()" [disabled]="exportando() || loading()">
          @if (exportando()) { <mat-spinner diameter="20"></mat-spinner> }
          @else { <mat-icon>download</mat-icon> }
          Exportar a Excel
        </button>
      </form>
    </mat-card>

    @if (loading()) {
      <div class="loading"><mat-spinner diameter="48"></mat-spinner></div>
    } @else if (data()) {

      <!-- Totales del periodo -->
      <div class="kpi-grid">
        <mat-card class="kpi">
          <span class="kpi-lbl">Total cobrado</span>
          <span class="kpi-val">{{ data()!.totales.total | currency:'MXN':'symbol':'1.2-2' }}</span>
        </mat-card>
        <mat-card class="kpi ok">
          <span class="kpi-lbl">Efectivo a entregar</span>
          <span class="kpi-val">{{ data()!.totales.efectivo | currency:'MXN':'symbol':'1.2-2' }}</span>
        </mat-card>
        <mat-card class="kpi">
          <span class="kpi-lbl">Transferencia</span>
          <span class="kpi-val">{{ data()!.totales.transferencia | currency:'MXN':'symbol':'1.2-2' }}</span>
        </mat-card>
        <mat-card class="kpi">
          <span class="kpi-lbl">Tarjeta</span>
          <span class="kpi-val">{{ data()!.totales.tarjeta | currency:'MXN':'symbol':'1.2-2' }}</span>
        </mat-card>
        <mat-card class="kpi">
          <span class="kpi-lbl">Depósito</span>
          <span class="kpi-val">{{ data()!.totales.deposito | currency:'MXN':'symbol':'1.2-2' }}</span>
        </mat-card>
        <mat-card class="kpi">
          <span class="kpi-lbl">Moratorio cobrado</span>
          <span class="kpi-val">{{ data()!.totales.moratorio | currency:'MXN':'symbol':'1.2-2' }}</span>
        </mat-card>
      </div>

      @if (data()!.dias.length === 0) {
        <mat-card class="empty-card">
          <mat-icon>event_busy</mat-icon>
          <p>No hay cobros registrados en este periodo.</p>
        </mat-card>
      }

      <!-- Un bloque por día -->
      @for (dia of data()!.dias; track dia.dia) {
        <mat-card class="dia-card">
          <div class="dia-head">
            <h3><mat-icon>today</mat-icon> {{ labelDia(dia.dia) }}</h3>
            <div class="dia-tot">
              <span class="dia-tot-lbl">Efectivo del día</span>
              <span class="dia-tot-val">{{ dia.efectivoDia | currency:'MXN':'symbol':'1.2-2' }}</span>
            </div>
          </div>

          <table mat-table [dataSource]="dia.cobradores" class="tabla">
            <ng-container matColumnDef="cobrador">
              <th mat-header-cell *matHeaderCellDef>Cobrador</th>
              <td mat-cell *matCellDef="let r">{{ r.cobrador }}</td>
              <td mat-footer-cell *matFooterCellDef>SUBTOTAL</td>
            </ng-container>
            <ng-container matColumnDef="numPagos">
              <th mat-header-cell *matHeaderCellDef class="r">Pagos</th>
              <td mat-cell *matCellDef="let r" class="r">{{ r.numPagos }}</td>
              <td mat-footer-cell *matFooterCellDef class="r">{{ sum(dia, 'numPagos') }}</td>
            </ng-container>
            <ng-container matColumnDef="creditos">
              <th mat-header-cell *matHeaderCellDef class="r">Créditos</th>
              <td mat-cell *matCellDef="let r" class="r">{{ r.creditos }}</td>
              <td mat-footer-cell *matFooterCellDef class="r">—</td>
            </ng-container>
            <ng-container matColumnDef="capital">
              <th mat-header-cell *matHeaderCellDef class="r">Capital</th>
              <td mat-cell *matCellDef="let r" class="r mono">{{ r.capital | currency:'MXN':'symbol':'1.2-2' }}</td>
              <td mat-footer-cell *matFooterCellDef class="r mono">{{ dia.capitalDia | currency:'MXN':'symbol':'1.2-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="interes">
              <th mat-header-cell *matHeaderCellDef class="r">Interés</th>
              <td mat-cell *matCellDef="let r" class="r mono">{{ r.interes | currency:'MXN':'symbol':'1.2-2' }}</td>
              <td mat-footer-cell *matFooterCellDef class="r mono">{{ dia.interesDia | currency:'MXN':'symbol':'1.2-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="moratorio">
              <th mat-header-cell *matHeaderCellDef class="r">Moratorio</th>
              <td mat-cell *matCellDef="let r" class="r mono">{{ r.moratorio | currency:'MXN':'symbol':'1.2-2' }}</td>
              <td mat-footer-cell *matFooterCellDef class="r mono">{{ dia.moratorioDia | currency:'MXN':'symbol':'1.2-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="efectivo">
              <th mat-header-cell *matHeaderCellDef class="r">Efectivo</th>
              <td mat-cell *matCellDef="let r" class="r mono ok">{{ r.efectivo | currency:'MXN':'symbol':'1.2-2' }}</td>
              <td mat-footer-cell *matFooterCellDef class="r mono ok">{{ dia.efectivoDia | currency:'MXN':'symbol':'1.2-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="transferencia">
              <th mat-header-cell *matHeaderCellDef class="r">Transferencia</th>
              <td mat-cell *matCellDef="let r" class="r mono">{{ r.transferencia | currency:'MXN':'symbol':'1.2-2' }}</td>
              <td mat-footer-cell *matFooterCellDef class="r mono">{{ dia.transferenciaDia | currency:'MXN':'symbol':'1.2-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="tarjeta">
              <th mat-header-cell *matHeaderCellDef class="r">Tarjeta</th>
              <td mat-cell *matCellDef="let r" class="r mono">{{ r.tarjeta | currency:'MXN':'symbol':'1.2-2' }}</td>
              <td mat-footer-cell *matFooterCellDef class="r mono">{{ dia.tarjetaDia | currency:'MXN':'symbol':'1.2-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="deposito">
              <th mat-header-cell *matHeaderCellDef class="r">Depósito</th>
              <td mat-cell *matCellDef="let r" class="r mono">{{ r.deposito | currency:'MXN':'symbol':'1.2-2' }}</td>
              <td mat-footer-cell *matFooterCellDef class="r mono">{{ dia.depositoDia | currency:'MXN':'symbol':'1.2-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="total">
              <th mat-header-cell *matHeaderCellDef class="r">Total</th>
              <td mat-cell *matCellDef="let r" class="r mono">{{ r.total | currency:'MXN':'symbol':'1.2-2' }}</td>
              <td mat-footer-cell *matFooterCellDef class="r mono">{{ dia.totalDia | currency:'MXN':'symbol':'1.2-2' }}</td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
            <tr mat-footer-row *matFooterRowDef="cols" class="footer-row"></tr>
          </table>
        </mat-card>
      }
    }
  `,
  styles: [`
    .page-header { margin-bottom:20px; }
    .page-header h1 { display:flex; align-items:center; gap:10px; font-size:24px; font-weight:700; color:#171923; margin:0; }
    .page-header .sub { color:#718096; font-size:14px; margin:4px 0 0; }

    .filtros { padding:16px; margin-bottom:20px; }
    .filtro-row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
    .f-date { width:170px; }
    .filtro-row ::ng-deep .mat-mdc-form-field-subscript-wrapper { display:none; }
    .spacer { flex:1; }

    .loading { display:flex; justify-content:center; padding:64px; }

    .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-bottom:20px; }
    .kpi { padding:18px; display:flex; flex-direction:column; gap:4px; border-left:4px solid #2795F5; }
    .kpi.ok { border-left-color:#16A34A; }
    .kpi-lbl { font-size:12px; color:#718096; text-transform:uppercase; letter-spacing:.4px; font-weight:600; }
    .kpi-val { font-size:24px; font-weight:700; color:#171923; }
    .kpi.ok .kpi-val { color:#16A34A; }

    .empty-card { text-align:center; padding:48px 24px; color:#A0AEC0; }
    .empty-card mat-icon { font-size:48px; width:48px; height:48px; }

    .dia-card { padding:18px; margin-bottom:18px; }
    .dia-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:8px; }
    .dia-head h3 { display:flex; align-items:center; gap:8px; margin:0; font-size:16px; font-weight:600; color:#2D3748; text-transform:capitalize; }
    .dia-head h3 mat-icon { color:#2795F5; }
    .dia-tot { text-align:right; }
    .dia-tot-lbl { display:block; font-size:11px; color:#718096; text-transform:uppercase; letter-spacing:.4px; }
    .dia-tot-val { font-size:20px; font-weight:700; color:#16A34A; }

    .tabla { width:100%; }
    .r { text-align:right; }
    .mono { font-variant-numeric:tabular-nums; }
    td.ok, .ok.mono { color:#16A34A; font-weight:600; }
    .footer-row { background:#F7FAFC; font-weight:700; }
    .footer-row td { font-weight:700; color:#2D3748; border-top:2px solid #E2E8F0; }

    @media(max-width:900px) {
      .dia-card { overflow-x:auto; }
    }
  `],
})
export class CollectorCashComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snack = inject(MatSnackBar);
  private http = inject(HttpClient);

  loading = signal(true);
  exportando = signal(false);
  data = signal<any | null>(null);

  cols = ['cobrador', 'numPagos', 'creditos', 'capital', 'interes', 'moratorio', 'efectivo', 'transferencia', 'tarjeta', 'deposito', 'total'];

  filtroForm = this.fb.group({
    start: [new Date(`${inicioMesMexico()}T00:00:00`)],
    end: [new Date(`${hoyMexico()}T00:00:00`)],
  });

  labelDia = labelDia;

  ngOnInit() {
    this.cargar();
  }

  hoy() {
    const h = new Date(`${hoyMexico()}T00:00:00`);
    this.filtroForm.patchValue({ start: h, end: h });
    this.cargar();
  }

  esteMes() {
    this.filtroForm.patchValue({
      start: new Date(`${inicioMesMexico()}T00:00:00`),
      end: new Date(`${hoyMexico()}T00:00:00`),
    });
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    const v = this.filtroForm.value;
    const params = {
      start: this.toISO(v.start as Date),
      end: this.toISO(v.end as Date),
    };

    this.api.get<any>('/reports/collector-cash', params).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo cargar el corte de caja', 'Cerrar', { duration: 4000 });
      },
    });
  }

  exportar() {
    this.exportando.set(true);
    const v = this.filtroForm.value;
    const params = new URLSearchParams({
      start: this.toISO(v.start as Date),
      end: this.toISO(v.end as Date),
    });

    this.http.get(`${environment.apiUrl}/reports/export/collector-cash?${params}`, {
      responseType: 'blob',
    }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `corte-cobradores-${params.get('start')}-a-${params.get('end')}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.exportando.set(false);
      },
      error: () => {
        this.exportando.set(false);
        this.snack.open('No se pudo exportar el Excel', 'Cerrar', { duration: 4000 });
      },
    });
  }

  /** Suma un campo numérico entero (pagos) de todos los cobradores del día. */
  sum(dia: any, campo: string): number {
    return (dia.cobradores || []).reduce((s: number, c: any) => s + Number(c[campo] || 0), 0);
  }

  private toISO(d: Date): string {
    if (!d) return hoyMexico();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}