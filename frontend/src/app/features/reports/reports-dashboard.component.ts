import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ApiService, AuthService } from '../../core/index';

@Component({
  selector: 'app-reports-dashboard',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatFormFieldModule, MatInputModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>bar_chart</mat-icon> Reportes</h1>
      <p style="color:#718096;font-size:13px;margin:0">Microcapital-Ixtepec</p>
    </div>

    <!-- KPI CARDS -->
    @if (portfolio()) {
      <div class="kpi-row-dash">
        <div class="kpi-dash kpi-blue">
          <div class="kpi-dash-left">
            <div class="kpi-dash-label">Créditos activos</div>
            <div class="kpi-dash-value">{{ portfolio()!.active }}</div>
            <div class="kpi-dash-sub"><span class="kpi-arrow up">↑</span>&nbsp;En campo</div>
          </div>
          <div class="kpi-dash-icon"><mat-icon>attach_money</mat-icon></div>
        </div>

        <div class="kpi-dash kpi-red">
          <div class="kpi-dash-left">
            <div class="kpi-dash-label">Créditos vencidos</div>
            <div class="kpi-dash-value">{{ portfolio()!.overdue }}</div>
            <div class="kpi-dash-sub">
              <span class="kpi-arrow down">↑</span>&nbsp;
              {{ portfolio()!.active > 0 ? ((portfolio()!.overdue / portfolio()!.active)*100).toFixed(1) : '0' }}% morosidad
            </div>
          </div>
          <div class="kpi-dash-icon"><mat-icon>warning</mat-icon></div>
        </div>

        <div class="kpi-dash kpi-green">
          <div class="kpi-dash-left">
            <div class="kpi-dash-label">Liquidados</div>
            <div class="kpi-dash-value">{{ portfolio()!.settled }}</div>
            <div class="kpi-dash-sub"><span class="kpi-arrow up">↑</span>&nbsp;Recuperados</div>
          </div>
          <div class="kpi-dash-icon"><mat-icon>check_circle</mat-icon></div>
        </div>

        <div class="kpi-dash kpi-amber">
          <div class="kpi-dash-left">
            <div class="kpi-dash-label">Cartera vigente</div>
            <div class="kpi-dash-value">{{ portfolio()!.totalActiveAmount | currency:'MXN':'symbol':'1.0-0' }}</div>
            <div class="kpi-dash-sub"><span class="kpi-arrow up">↑</span>&nbsp;Capital colocado</div>
          </div>
          <div class="kpi-dash-icon"><mat-icon>account_balance_wallet</mat-icon></div>
        </div>
      </div>
    }

    <!-- Exportar y flujo de caja (sin cambios) -->
    <div class="reports-grid">
      <mat-card class="report-card">
        <mat-card-content>
          <div class="report-icon">
            <mat-icon style="font-size:40px;width:40px;height:40px;color:#1C4532">table_chart</mat-icon>
          </div>
          <h3>Cartera vigente</h3>
          <p>Exporta todos los créditos activos con sus datos completos en formato Excel.</p>
          <button mat-raised-button color="primary" (click)="exportPortfolio()" [disabled]="exporting()">
            @if (exporting()) { <mat-spinner diameter="20"></mat-spinner> }
            @else { <mat-icon>download</mat-icon> }
            Descargar Excel
          </button>
        </mat-card-content>
      </mat-card>

      <mat-card class="report-card">
        <mat-card-content>
          <div class="report-icon">
            <mat-icon style="font-size:40px;width:40px;height:40px;color:#1C4532">payments</mat-icon>
          </div>
          <h3>Flujo de caja</h3>
          <p>Consulta los desembolsos y pagos por rango de fechas.</p>
          <form [formGroup]="cashFlowForm" (ngSubmit)="loadCashFlow()" class="date-form">
            <mat-form-field appearance="outline" class="date-field">
              <mat-label>Desde</mat-label>
              <input matInput type="date" formControlName="start">
            </mat-form-field>
            <mat-form-field appearance="outline" class="date-field">
              <mat-label>Hasta</mat-label>
              <input matInput type="date" formControlName="end">
            </mat-form-field>
            <button mat-stroked-button color="primary" type="submit">
              <mat-icon>search</mat-icon> Consultar
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>

    @if (cashFlow().length > 0) {
      <mat-card class="mt-16">
        <mat-card-header><mat-card-title>Flujo de caja — Desembolsos por día</mat-card-title></mat-card-header>
        <mat-card-content>
          <table class="cf-table">
            <thead>
              <tr><th>Fecha</th><th class="text-right">Monto desembolsado</th></tr>
            </thead>
            <tbody>
              @for (row of cashFlow(); track row.date) {
                <tr>
                  <td>{{ row.date }}</td>
                  <td class="text-right">{{ row.disbursed | currency:'MXN' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: [`
    .kpi-row-dash { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:28px; }
    @media(max-width:900px){ .kpi-row-dash { grid-template-columns:1fr 1fr; } }
    @media(max-width:500px){ .kpi-row-dash { grid-template-columns:1fr; } }
    .kpi-dash { border-radius:16px; padding:22px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; position:relative; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,.15); }
    .kpi-dash::after { content:''; position:absolute; right:-20px; top:-20px; width:100px; height:100px; border-radius:50%; background:rgba(255,255,255,.08); }
    .kpi-blue   { background:linear-gradient(135deg,#4F7AF8 0%,#6B5CE7 100%); }
    .kpi-red    { background:linear-gradient(135deg,#EF4444 0%,#B91C1C 100%); }
    .kpi-green  { background:linear-gradient(135deg,#1C4532 0%,#245c3e 100%); }
    .kpi-amber  { background:linear-gradient(135deg,#F59E0B 0%,#D97706 100%); }
    .kpi-purple { background:linear-gradient(135deg,#9B59B6 0%,#6B5CE7 100%); }
    .kpi-dash-left { flex:1; }
    .kpi-dash-label { font-family:'Inter',sans-serif; font-size:13px; font-weight:500; color:rgba(255,255,255,.75); margin-bottom:6px; }
    .kpi-dash-value { font-family:'Inter',sans-serif; font-size:32px; font-weight:700; color:#fff; letter-spacing:-0.68px; line-height:1; margin-bottom:8px; }
    .kpi-dash-sub   { font-family:'Inter',sans-serif; font-size:12px; color:rgba(255,255,255,.65); display:flex; align-items:center; }
    .kpi-arrow.up   { color:#86efac; font-weight:700; }
    .kpi-arrow.down { color:#fca5a5; font-weight:700; }
    .kpi-dash-icon  { width:48px; height:48px; background:rgba(255,255,255,.15); border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; z-index:1; }
    .kpi-dash-icon mat-icon { color:#fff !important; font-size:24px; width:24px; height:24px; }

    .reports-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:8px; }
    @media(max-width:700px){ .reports-grid { grid-template-columns:1fr; } }
    .report-card mat-card-content { display:flex; flex-direction:column; gap:12px; padding:20px; }
    .report-icon { margin-bottom:4px; }
    .report-card h3 { margin:0; font-size:16px; font-weight:700; color:#171923; }
    .report-card p  { margin:0; font-size:13px; color:#718096; line-height:1.6; }
    .date-form  { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start; }
    .date-field { min-width:140px; }
    .cf-table   { width:100%; border-collapse:collapse; font-size:14px; }
    .cf-table th,
    .cf-table td { padding:10px 14px; border-bottom:1px solid #CBD5E0; }
    .cf-table th  { font-weight:600; color:#718096; font-size:12px; text-transform:uppercase; }
    .text-right   { text-align:right; }
    .mt-16        { margin-top:16px; }
  `],
})
export class ReportsDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private fb  = inject(FormBuilder);
  portfolio = signal<any>(null);
  cashFlow  = signal<any[]>([]);
  exporting = signal(false);

  cashFlowForm = this.fb.group({
    start: [new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]],
    end:   [new Date().toISOString().split('T')[0]],
  });

  ngOnInit() {
    this.api.get<any>('/reports/portfolio').subscribe({ next: (p) => this.portfolio.set(p) });
  }

  exportPortfolio() {
    this.exporting.set(true);
    this.api.getBlob('/reports/export/portfolio').subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `cartera-vigente-${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click(); URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  loadCashFlow() {
    const { start, end } = this.cashFlowForm.value;
    this.api.get<any[]>('/reports/cash-flow', { start, end }).subscribe({
      next: (data) => this.cashFlow.set(data),
    });
  }
}