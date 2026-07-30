import {
  Component, OnInit, AfterViewInit, OnDestroy, inject, signal,
  ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
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
import Chart from 'chart.js/auto';
import { ApiService } from '../../core/index';

/** Fecha de hoy en zona de México (YYYY-MM-DD). */
function hoyMexico(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Primer día del mes hace N meses (YYYY-MM-DD), en zona de México. */
function haceMeses(n: number): string {
  const hoy = new Date();
  hoy.setMonth(hoy.getMonth() - n);
  hoy.setDate(1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(hoy);
}

/** Convierte '2026-03' a 'Mar 2026' para las etiquetas. */
function labelMes(ym: string): string {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${meses[Number(m) - 1] || m} ${y}`;
}

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DecimalPipe, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatTableModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>insights</mat-icon> Analítica de cartera</h1>
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

        <button mat-stroked-button type="button" (click)="ultimosMeses(3)">3 meses</button>
        <button mat-stroked-button type="button" (click)="ultimosMeses(6)">6 meses</button>
        <button mat-stroked-button type="button" (click)="ultimosMeses(12)">12 meses</button>

        <span class="spacer"></span>

        <button mat-raised-button color="accent" type="button"
                (click)="exportarTodo()" [disabled]="exportando() || loading()">
          @if (exportando()) { <mat-spinner diameter="20"></mat-spinner> }
          @else { <mat-icon>download</mat-icon> }
          Exportar todo a Excel
        </button>
      </form>
    </mat-card>

    @if (loading()) {
      <div class="loading"><mat-spinner diameter="48"></mat-spinner></div>
    } @else if (data()) {

      <!-- KPIs principales -->
      <div class="kpi-grid">
        <mat-card class="kpi">
          <span class="kpi-lbl">Cartera total</span>
          <span class="kpi-val">{{ data()!.morosidad.carteraTotal | currency:'MXN':'symbol':'1.0-0' }}</span>
          <span class="kpi-sub">{{ data()!.morosidad.totalActivos }} créditos activos</span>
        </mat-card>

        <mat-card class="kpi danger">
          <span class="kpi-lbl">Cartera en mora</span>
          <span class="kpi-val">{{ data()!.morosidad.carteraEnMora | currency:'MXN':'symbol':'1.0-0' }}</span>
          <span class="kpi-sub">{{ data()!.morosidad.enMora }} créditos</span>
        </mat-card>

        <mat-card class="kpi" [class.danger]="data()!.morosidad.tasaMonto > 10">
          <span class="kpi-lbl">Tasa de morosidad</span>
          <span class="kpi-val">{{ data()!.morosidad.tasaMonto | number:'1.1-1' }}%</span>
          <span class="kpi-sub">por monto de cartera</span>
        </mat-card>

        <mat-card class="kpi">
          <span class="kpi-lbl">Morosidad por créditos</span>
          <span class="kpi-val">{{ data()!.morosidad.tasaCreditos | number:'1.1-1' }}%</span>
          <span class="kpi-sub">{{ data()!.morosidad.enMora }} de {{ data()!.morosidad.totalActivos }}</span>
        </mat-card>
      </div>

      <!-- Gráficas: tendencias mensuales -->
      <div class="chart-grid">
        <mat-card class="chart-card">
          <div class="chart-head">
            <h3><mat-icon>assignment</mat-icon> Solicitudes por mes</h3>
            <button mat-icon-button matTooltip="Exportar a Excel"
                    (click)="exportarUno('solicitudes', 'chartSolicitudes')" [disabled]="exportando()">
              <mat-icon>download</mat-icon>
            </button>
          </div>
          <div class="chart-box"><canvas #chartSolicitudes></canvas></div>
        </mat-card>

        <mat-card class="chart-card">
          <div class="chart-head">
            <h3><mat-icon>warning</mat-icon> Atrasos por mes</h3>
            <button mat-icon-button matTooltip="Exportar a Excel"
                    (click)="exportarUno('atrasos', 'chartAtrasos')" [disabled]="exportando()">
              <mat-icon>download</mat-icon>
            </button>
          </div>
          <div class="chart-box"><canvas #chartAtrasos></canvas></div>
        </mat-card>

        <mat-card class="chart-card">
          <div class="chart-head">
            <h3><mat-icon>trending_up</mat-icon> Colocación por mes</h3>
            <button mat-icon-button matTooltip="Exportar a Excel"
                    (click)="exportarUno('colocacion', 'chartColocacion')" [disabled]="exportando()">
              <mat-icon>download</mat-icon>
            </button>
          </div>
          <div class="chart-box"><canvas #chartColocacion></canvas></div>
        </mat-card>

        <mat-card class="chart-card">
          <div class="chart-head">
            <h3><mat-icon>payments</mat-icon> Recuperación por mes</h3>
            <button mat-icon-button matTooltip="Exportar a Excel"
                    (click)="exportarUno('recuperacion', 'chartRecuperacion')" [disabled]="exportando()">
              <mat-icon>download</mat-icon>
            </button>
          </div>
          <div class="chart-box"><canvas #chartRecuperacion></canvas></div>
        </mat-card>
      </div>

      <!-- Gráficas: distribución -->
      <div class="chart-grid-2">
        <mat-card class="chart-card">
          <div class="chart-head">
            <h3><mat-icon>donut_large</mat-icon> Estado de la cartera</h3>
            <button mat-icon-button matTooltip="Exportar a Excel"
                    (click)="exportarUno('estado', 'chartEstado')" [disabled]="exportando()">
              <mat-icon>download</mat-icon>
            </button>
          </div>
          <div class="chart-box"><canvas #chartEstado></canvas></div>
        </mat-card>

        <mat-card class="chart-card">
          <div class="chart-head">
            <h3><mat-icon>category</mat-icon> Créditos por tipo</h3>
            <button mat-icon-button matTooltip="Exportar a Excel"
                    (click)="exportarUno('por-tipo', 'chartTipo')" [disabled]="exportando()">
              <mat-icon>download</mat-icon>
            </button>
          </div>
          <div class="chart-box"><canvas #chartTipo></canvas></div>
        </mat-card>
      </div>

      <!-- Desempeño por cobrador -->
      <mat-card class="tabla-card">
        <div class="chart-head">
          <h3><mat-icon>groups</mat-icon> Desempeño por cobrador</h3>
          <button mat-icon-button matTooltip="Exportar a Excel"
                  (click)="exportarUno('cobradores')" [disabled]="exportando()">
            <mat-icon>download</mat-icon>
          </button>
        </div>
        @if (data()!.desempenoCobradores.length === 0) {
          <p class="empty">Sin pagos registrados por cobradores en este periodo.</p>
        } @else {
          <table mat-table [dataSource]="data()!.desempenoCobradores" class="tabla">
            <ng-container matColumnDef="cobrador">
              <th mat-header-cell *matHeaderCellDef>Cobrador</th>
              <td mat-cell *matCellDef="let r">{{ r.cobrador }}</td>
            </ng-container>
            <ng-container matColumnDef="pagos">
              <th mat-header-cell *matHeaderCellDef class="r">Pagos</th>
              <td mat-cell *matCellDef="let r" class="r">{{ r.num_pagos }}</td>
            </ng-container>
            <ng-container matColumnDef="creditos">
              <th mat-header-cell *matHeaderCellDef class="r">Créditos</th>
              <td mat-cell *matCellDef="let r" class="r">{{ r.creditos_atendidos }}</td>
            </ng-container>
            <ng-container matColumnDef="cobrado">
              <th mat-header-cell *matHeaderCellDef class="r">Total cobrado</th>
              <td mat-cell *matCellDef="let r" class="r mono">
                {{ r.total_cobrado | currency:'MXN':'symbol':'1.2-2' }}
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="colsCobradores"></tr>
            <tr mat-row *matRowDef="let row; columns: colsCobradores"></tr>
          </table>
        }
      </mat-card>
    }
  `,
  styles: [`
    .page-header h1 { display:flex; align-items:center; gap:10px; }
    .filtros { padding:16px; margin-bottom:20px; }
    .filtro-row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
    .f-date { width:170px; }
    .filtro-row ::ng-deep .mat-mdc-form-field-subscript-wrapper { display:none; }

    .loading { display:flex; justify-content:center; padding:64px; }

    .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
                gap:16px; margin-bottom:20px; }
    .kpi { padding:18px; display:flex; flex-direction:column; gap:4px;
           border-left:4px solid #2795F5; }
    .kpi.danger { border-left-color:#DC2626; }
    .kpi-lbl { font-size:12px; color:#718096; text-transform:uppercase;
               letter-spacing:.4px; font-weight:600; }
    .kpi-val { font-size:26px; font-weight:700; color:#171923; }
    .kpi.danger .kpi-val { color:#DC2626; }
    .kpi-sub { font-size:12px; color:#A0AEC0; }

    .chart-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr));
                  gap:16px; margin-bottom:20px; }
    .chart-grid-2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(380px,1fr));
                    gap:16px; margin-bottom:20px; }
    .chart-card { padding:18px; }
    .chart-head { display:flex; align-items:center; justify-content:space-between;
                  margin-bottom:16px; }
    .chart-head h3 { margin:0 !important; }
    .spacer { flex:1; }
    .chart-card h3 { display:flex; align-items:center; gap:8px; margin:0 0 16px;
                     font-size:15px; font-weight:600; color:#2D3748; }
    .chart-card h3 mat-icon { font-size:20px; width:20px; height:20px; color:#2795F5; }
    .chart-box { position:relative; height:280px; }

    .tabla-card { padding:18px; }
    .tabla-card h3 { display:flex; align-items:center; gap:8px; margin:0 0 16px;
                     font-size:15px; font-weight:600; color:#2D3748; }
    .tabla-card h3 mat-icon { color:#2795F5; }
    .tabla { width:100%; }
    .r { text-align:right; }
    .mono { font-variant-numeric:tabular-nums; font-weight:600; }
    .empty { color:#A0AEC0; text-align:center; padding:24px; }

    @media(max-width:900px) {
      .chart-grid, .chart-grid-2 { grid-template-columns:1fr; }
    }
  `],
})
export class AnalyticsDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snack = inject(MatSnackBar);
  private http = inject(HttpClient);

  @ViewChild('chartSolicitudes') refSolicitudes?: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartAtrasos') refAtrasos?: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartColocacion') refColocacion?: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartRecuperacion') refRecuperacion?: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartEstado') refEstado?: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartTipo') refTipo?: ElementRef<HTMLCanvasElement>;

  loading = signal(true);
  exportando = signal(false);
  data = signal<any | null>(null);
  colsCobradores = ['cobrador', 'pagos', 'creditos', 'cobrado'];

  private charts: Chart[] = [];

  filtroForm = this.fb.group({
    start: [new Date(haceMeses(11))],
    end: [new Date(hoyMexico())],
  });

  ngOnInit() {
    this.cargar();
  }

  ngAfterViewInit() {
    // Las gráficas se dibujan cuando llegan los datos (en cargar()).
  }

  ngOnDestroy() {
    this.destruirGraficas();
  }

  ultimosMeses(n: number) {
    this.filtroForm.patchValue({
      start: new Date(haceMeses(n - 1)),
      end: new Date(hoyMexico()),
    });
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.destruirGraficas();

    const v = this.filtroForm.value;
    const params = {
      start: this.toISO(v.start as Date),
      end: this.toISO(v.end as Date),
    };

    this.api.get<any>('/analytics/dashboard', params).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
        // Esperar a que el DOM renderice los canvas antes de dibujar.
        setTimeout(() => this.dibujarGraficas(), 50);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo cargar la analítica', 'Cerrar', { duration: 4000 });
      },
    });
  }

  private toISO(d: Date): string {
    if (!d) return hoyMexico();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private destruirGraficas() {
    this.charts.forEach((c) => c.destroy());
    this.charts = [];
  }

  // ══════════════════════════════════════════════════════════
  // EXPORTACIÓN A EXCEL
  // ══════════════════════════════════════════════════════════

  /** Captura la imagen de un canvas de gráfica como data URL (PNG). */
  private capturarGrafica(ref?: ElementRef<HTMLCanvasElement>): string | null {
    try {
      const canvas = ref?.nativeElement;
      if (!canvas) return null;

      // El canvas de Chart.js es transparente; al insertarlo en Excel eso puede
      // verse mal. Se compone sobre un fondo blanco antes de exportar.
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const ctx = tmp.getContext('2d');
      if (!ctx) return canvas.toDataURL('image/png');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, tmp.width, tmp.height);
      ctx.drawImage(canvas, 0, 0);
      return tmp.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  /** Excel completo: todas las hojas de datos + las gráficas como imágenes. */
  exportarTodo() {
    this.exportando.set(true);

    // Capturar todas las gráficas visibles.
    const imagenes: Record<string, string> = {};
    const capturas: Array<[string, ElementRef<HTMLCanvasElement> | undefined]> = [
      ['solicitudes', this.refSolicitudes],
      ['atrasos', this.refAtrasos],
      ['colocacion', this.refColocacion],
      ['recuperacion', this.refRecuperacion],
      ['estado', this.refEstado],
      ['tipo', this.refTipo],
    ];
    for (const [clave, ref] of capturas) {
      const img = this.capturarGrafica(ref);
      if (img) imagenes[clave] = img;
    }

    const v = this.filtroForm.value;
    const body = {
      start: this.toISO(v.start as Date),
      end: this.toISO(v.end as Date),
      imagenes,
    };

    this.http.post(`${environment.apiUrl}/analytics/export/dashboard`, body, {
      responseType: 'blob',
    }).subscribe({
      next: (blob) => {
        this.descargar(blob, `analitica-cartera-${body.start}-a-${body.end}.xlsx`);
        this.exportando.set(false);
      },
      error: () => {
        this.exportando.set(false);
        this.snack.open('No se pudo exportar el Excel', 'Cerrar', { duration: 4000 });
      },
    });
  }

  /**
   * Excel de una sola gráfica/tabla.
   * @param tipo   clave del bloque (solicitudes, atrasos, cobradores...)
   * @param canvas nombre del ViewChild del canvas (opcional, para la imagen)
   */
  exportarUno(tipo: string, canvas?: string) {
    this.exportando.set(true);

    // Capturar la imagen de esa gráfica (si aplica).
    const refs: Record<string, ElementRef<HTMLCanvasElement> | undefined> = {
      chartSolicitudes: this.refSolicitudes,
      chartAtrasos: this.refAtrasos,
      chartColocacion: this.refColocacion,
      chartRecuperacion: this.refRecuperacion,
      chartEstado: this.refEstado,
      chartTipo: this.refTipo,
    };
    const imagen = canvas ? this.capturarGrafica(refs[canvas]) : null;

    const v = this.filtroForm.value;
    const body = {
      tipo,
      start: this.toISO(v.start as Date),
      end: this.toISO(v.end as Date),
      imagen: imagen || undefined,
    };

    this.http.post(`${environment.apiUrl}/analytics/export/${tipo}`, body, {
      responseType: 'blob',
    }).subscribe({
      next: (blob) => {
        this.descargar(blob, `${tipo}.xlsx`);
        this.exportando.set(false);
      },
      error: () => {
        this.exportando.set(false);
        this.snack.open('No se pudo exportar', 'Cerrar', { duration: 4000 });
      },
    });
  }

  private descargar(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private dibujarGraficas() {
    const d = this.data();
    if (!d) return;

    const AZUL = '#2795F5';
    const ROJO = '#DC2626';
    const VERDE = '#16A34A';
    const NARANJA = '#F59E0B';
    const MORADO = '#8B5CF6';
    const GRIS = '#94A3B8';

    // ── 1. Solicitudes por mes (barras) ──
    if (this.refSolicitudes?.nativeElement) {
      const rows = d.solicitudesPorMes || [];
      this.charts.push(new Chart(this.refSolicitudes.nativeElement, {
        type: 'bar',
        data: {
          labels: rows.map((r: any) => labelMes(r.mes)),
          datasets: [
            {
              label: 'Aprobadas',
              data: rows.map((r: any) => Number(r.aprobadas || 0)),
              backgroundColor: VERDE,
            },
            {
              label: 'Rechazadas',
              data: rows.map((r: any) => Number(r.rechazadas || 0)),
              backgroundColor: ROJO,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
          plugins: { legend: { position: 'bottom' } },
        },
      }));
    }

    // ── 2. Atrasos por mes (barras + línea de monto) ──
    if (this.refAtrasos?.nativeElement) {
      const rows = d.atrasosPorMes || [];
      this.charts.push(new Chart(this.refAtrasos.nativeElement, {
        type: 'bar',
        data: {
          labels: rows.map((r: any) => labelMes(r.mes)),
          datasets: [
            {
              label: 'Cuotas vencidas',
              data: rows.map((r: any) => Number(r.cuotas_vencidas || 0)),
              backgroundColor: NARANJA,
              yAxisID: 'y',
            },
            {
              label: 'Monto atrasado',
              type: 'line',
              data: rows.map((r: any) => Number(r.monto_atrasado || 0)),
              borderColor: ROJO,
              backgroundColor: 'transparent',
              yAxisID: 'y1',
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Cuotas' } },
            y1: {
              beginAtZero: true, position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: '$' },
            },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      }));
    }

    // ── 3. Colocación por mes (barras) ──
    if (this.refColocacion?.nativeElement) {
      const rows = d.colocacionPorMes || [];
      this.charts.push(new Chart(this.refColocacion.nativeElement, {
        type: 'bar',
        data: {
          labels: rows.map((r: any) => labelMes(r.mes)),
          datasets: [{
            label: 'Monto colocado',
            data: rows.map((r: any) => Number(r.monto_colocado || 0)),
            backgroundColor: AZUL,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterLabel: (ctx: any) => {
                  const r = rows[ctx.dataIndex];
                  return `${r.num_creditos} créditos`;
                },
              },
            },
          },
        },
      }));
    }

    // ── 4. Recuperación por mes (barras apiladas) ──
    if (this.refRecuperacion?.nativeElement) {
      const rows = d.recuperacionPorMes || [];
      this.charts.push(new Chart(this.refRecuperacion.nativeElement, {
        type: 'bar',
        data: {
          labels: rows.map((r: any) => labelMes(r.mes)),
          datasets: [
            {
              label: 'Capital',
              data: rows.map((r: any) => Number(r.capital || 0)),
              backgroundColor: AZUL,
            },
            {
              label: 'Interés',
              data: rows.map((r: any) => Number(r.interes || 0)),
              backgroundColor: VERDE,
            },
            {
              label: 'Moratorio',
              data: rows.map((r: any) => Number(r.moratorio || 0)),
              backgroundColor: ROJO,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
          plugins: { legend: { position: 'bottom' } },
        },
      }));
    }

    // ── 5. Estado de la cartera (dona) ──
    if (this.refEstado?.nativeElement) {
      const rows = d.estadoCartera || [];
      const colorPorEstado: Record<string, string> = {
        ACTIVO: VERDE, ATRASADO: NARANJA, VENCIDO: ROJO,
        LIQUIDADO: AZUL, SOLICITUD: GRIS, AUTORIZADO: MORADO,
        RECHAZADO: '#64748B', CASTIGADO: '#475569',
        REESTRUCTURADO: '#EC4899', CONVENIO: '#6366F1',
      };
      this.charts.push(new Chart(this.refEstado.nativeElement, {
        type: 'doughnut',
        data: {
          labels: rows.map((r: any) => r.estado),
          datasets: [{
            data: rows.map((r: any) => Number(r.total || 0)),
            backgroundColor: rows.map((r: any) => colorPorEstado[r.estado] || GRIS),
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right' } },
        },
      }));
    }

    // ── 6. Créditos por tipo (barras horizontales) ──
    if (this.refTipo?.nativeElement) {
      const rows = d.creditosPorTipo || [];
      this.charts.push(new Chart(this.refTipo.nativeElement, {
        type: 'bar',
        data: {
          labels: rows.map((r: any) => r.tipo),
          datasets: [{
            label: 'Créditos',
            data: rows.map((r: any) => Number(r.total || 0)),
            backgroundColor: MORADO,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          scales: { x: { beginAtZero: true } },
          plugins: { legend: { display: false } },
        },
      }));
    }
  }
}