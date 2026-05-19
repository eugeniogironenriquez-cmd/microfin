import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService, AuthService, Loan, PagedResponse } from '../../core/index';

@Component({
  selector: 'app-collection-dashboard',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, RouterLink,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatPaginatorModule, MatChipsModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>directions_bike</mat-icon> Cobranza</h1>
      @if (auth.hasRole('ADMIN')) {
        <a mat-raised-button color="primary" routerLink="/collection/assignments">
          <mat-icon>assignment</mat-icon> Asignar cobradores
        </a>
      }
    </div>

    <!-- KPI CARDS -->
    <div class="kpi-row-dash">
      <div class="kpi-dash kpi-red">
        <div class="kpi-dash-left">
          <div class="kpi-dash-label">Créditos vencidos</div>
          <div class="kpi-dash-value">{{ total() }}</div>
          <div class="kpi-dash-sub"><span class="kpi-arrow down">↑</span>&nbsp;Requieren atención</div>
        </div>
        <div class="kpi-dash-icon"><mat-icon>warning</mat-icon></div>
      </div>

      <div class="kpi-dash kpi-blue">
        <div class="kpi-dash-left">
          <div class="kpi-dash-label">En esta página</div>
          <div class="kpi-dash-value">{{ loans().length }}</div>
          <div class="kpi-dash-sub"><span class="kpi-arrow up">↑</span>&nbsp;Registros cargados</div>
        </div>
        <div class="kpi-dash-icon"><mat-icon>list_alt</mat-icon></div>
      </div>

      <div class="kpi-dash kpi-green">
        <div class="kpi-dash-left">
          <div class="kpi-dash-label">Con cobrador</div>
          <div class="kpi-dash-value">{{ withCollector() }}</div>
          <div class="kpi-dash-sub"><span class="kpi-arrow up">↑</span>&nbsp;Asignados</div>
        </div>
        <div class="kpi-dash-icon"><mat-icon>person_pin</mat-icon></div>
      </div>

      <div class="kpi-dash kpi-amber">
        <div class="kpi-dash-left">
          <div class="kpi-dash-label">Sin cobrador</div>
          <div class="kpi-dash-value">{{ loans().length - withCollector() }}</div>
          <div class="kpi-dash-sub"><span class="kpi-arrow down">↑</span>&nbsp;Sin asignar</div>
        </div>
        <div class="kpi-dash-icon"><mat-icon>person_off</mat-icon></div>
      </div>
    </div>

    <!-- TABLA -->
    <mat-card>
      <mat-card-header><mat-card-title>Cartera vencida</mat-card-title></mat-card-header>
      <mat-card-content>
        @if (loading()) {
          <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
        } @else if (loans().length === 0) {
          <div class="empty-state">
            <mat-icon>check_circle</mat-icon>
            <p>Sin cartera vencida — ¡Excelente!</p>
          </div>
        } @else {
          <table mat-table [dataSource]="loans()">
            <ng-container matColumnDef="customer">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let r">
                <div class="client-name">{{ r.customer?.fullName }}</div>
                <div class="client-sub">{{ r.customer?.phone }}</div>
              </td>
            </ng-container>
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef>Monto original</th>
              <td mat-cell *matCellDef="let r">{{ r.principalAmount | currency:'MXN' }}</td>
            </ng-container>
            <ng-container matColumnDef="payment">
              <th mat-header-cell *matHeaderCellDef>Cuota</th>
              <td mat-cell *matCellDef="let r">{{ r.periodicPayment | currency:'MXN' }}</td>
            </ng-container>
            <ng-container matColumnDef="disbursed">
              <th mat-header-cell *matHeaderCellDef>Desembolso</th>
              <td mat-cell *matCellDef="let r">{{ r.disbursedAt | date:'dd/MM/yyyy' }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let r">
                <a mat-icon-button [routerLink]="['/loans', r.id]" matTooltip="Ver crédito">
                  <mat-icon>visibility</mat-icon>
                </a>
                <a mat-icon-button [routerLink]="['/payments']" [queryParams]="{loanId: r.id}"
                   matTooltip="Registrar pago" color="primary">
                  <mat-icon>payment</mat-icon>
                </a>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>
          </table>
          <mat-paginator [length]="total()" [pageSize]="pageSize"
                         [pageSizeOptions]="[10,20,50]" (page)="onPage($event)">
          </mat-paginator>
        }
      </mat-card-content>
    </mat-card>
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

    .client-name { font-weight:600; font-size:14px; }
    .client-sub  { font-size:11px; color:#718096; margin-top:2px; }
  `],
})
export class CollectionDashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);
  loans = signal<Loan[]>([]);
  total = signal(0);
  loading = signal(true);
  withCollector = signal(0);
  page = 0; pageSize = 20;
  cols = ['customer', 'amount', 'payment', 'disbursed', 'actions'];

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.get<PagedResponse<Loan>>('/collection/overdue', { page: this.page + 1, limit: this.pageSize }).subscribe({
      next: (r) => {
        this.loans.set(r.data);
        this.total.set(r.total);
        this.withCollector.set(r.data.filter((l: any) => l.collectorId).length);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onPage(e: PageEvent) { this.page = e.pageIndex; this.pageSize = e.pageSize; this.load(); }
}