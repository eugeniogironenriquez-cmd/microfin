import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { debounceTime, distinctUntilChanged, interval } from 'rxjs';
import { ApiService, Loan, PagedResponse } from '../../core/index';
import { PdfDownloadService } from '../../core/pdf-download.service';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, DecimalPipe, RouterLink, ReactiveFormsModule,
    MatCardModule, MatTableModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatInputModule, MatSelectModule, MatFormFieldModule, MatProgressSpinnerModule,
    MatTooltipModule, MatChipsModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>account_balance_wallet</mat-icon> Cartera en tiempo real</h1>
      <div class="header-actions">
        <span class="last-update">Actualizado: {{ lastUpdate() | date:'HH:mm:ss' }}</span>
        <button mat-icon-button (click)="load()" matTooltip="Actualizar">
          <mat-icon>refresh</mat-icon>
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-row">
      <div class="kpi-pill primary">
        <mat-icon>attach_money</mat-icon>
        <div>
          <div class="kpi-num">{{ summary().active }}</div>
          <div class="kpi-lbl">Activos</div>
        </div>
      </div>
      <div class="kpi-pill atrasado">
        <mat-icon>schedule</mat-icon>
        <div>
          <div class="kpi-num">{{ summary().atrasados }}</div>
          <div class="kpi-lbl">Atrasados</div>
        </div>
      </div>
      <div class="kpi-pill danger">
        <mat-icon>warning</mat-icon>
        <div>
          <div class="kpi-num">{{ summary().overdue }}</div>
          <div class="kpi-lbl">Vencidos</div>
        </div>
      </div>
      <div class="kpi-pill warning">
        <mat-icon>refresh</mat-icon>
        <div>
          <div class="kpi-num">{{ summary().restructured }}</div>
          <div class="kpi-lbl">Reestructurados</div>
        </div>
      </div>
      <div class="kpi-pill success">
        <mat-icon>check_circle</mat-icon>
        <div>
          <div class="kpi-num">{{ summary().settled }}</div>
          <div class="kpi-lbl">Liquidados</div>
        </div>
      </div>
      <div class="kpi-pill accent">
        <mat-icon>account_balance_wallet</mat-icon>
        <div>
          <div class="kpi-num">{{ summary().totalActiveAmount | currency:'MXN':'symbol':'1.0-0' }}</div>
          <div class="kpi-lbl">Cartera total</div>
        </div>
      </div>
    </div>

    <!-- Filtros -->
    <mat-card class="filters-card">
      <div class="filters-row">
        <mat-form-field appearance="outline" class="filter-search">
          <mat-label>Buscar cliente</mat-label>
          <input matInput [formControl]="searchCtrl" placeholder="Nombre, CURP, teléfono">
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-status">
          <mat-label>Estado</mat-label>
          <mat-select [formControl]="statusCtrl">
            <mat-option value="">Todos</mat-option>
            <mat-option value="ACTIVO">Activo</mat-option>
            <mat-option value="ATRASADO">Atrasado</mat-option>
            <mat-option value="VENCIDO">Vencido</mat-option>
            <mat-option value="SOLICITUD">Solicitud</mat-option>
            <mat-option value="AUTORIZADO">Autorizado</mat-option>
            <mat-option value="REESTRUCTURADO">Reestructurado</mat-option>
            <mat-option value="LIQUIDADO">Liquidado</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-stroked-button (click)="clearFilters()">
          <mat-icon>filter_alt_off</mat-icon> Limpiar
        </button>
      </div>
    </mat-card>

    <!-- Tabla -->
    <mat-card class="table-card">
      @if (loading()) {
        <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
      } @else {
        <table mat-table [dataSource]="loans()" class="portfolio-table">

          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>Cliente</th>
            <td mat-cell *matCellDef="let r">
              <div class="customer-cell">
                <span class="name">{{ r.customer?.fullName }}</span>
                <span class="sub">{{ r.customer?.phone }}</span>
              </div>
            </td>
          </ng-container>

          <ng-container matColumnDef="type">
            <th mat-header-cell *matHeaderCellDef>Tipo</th>
            <td mat-cell *matCellDef="let r">{{ r.loanType?.name }}</td>
          </ng-container>

          <ng-container matColumnDef="amount">
            <th mat-header-cell *matHeaderCellDef>Monto</th>
            <td mat-cell *matCellDef="let r">
              <strong>{{ r.principalAmount | currency:'MXN':'symbol':'1.2-2' }}</strong>
            </td>
          </ng-container>

          <ng-container matColumnDef="payment">
            <th mat-header-cell *matHeaderCellDef>Cuota</th>
            <td mat-cell *matCellDef="let r">{{ r.periodicPayment | currency:'MXN':'symbol':'1.2-2' }}</td>
          </ng-container>

          <ng-container matColumnDef="disbursed">
            <th mat-header-cell *matHeaderCellDef>Desembolso</th>
            <td mat-cell *matCellDef="let r">{{ r.disbursedAt | date:'dd/MM/yyyy' }}</td>
          </ng-container>

          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let r">
              <span class="badge badge-{{ r.status | lowercase }}">{{ r.status }}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let r">
              <a mat-icon-button [routerLink]="['/loans', r.id]" matTooltip="Ver detalle">
                <mat-icon>visibility</mat-icon>
              </a>
              @if (r.status === 'ACTIVO' || r.status === 'ATRASADO' || r.status === 'VENCIDO') {
                <a mat-icon-button [routerLink]="['/payments']" matTooltip="Registrar pago" color="primary">
                  <mat-icon>payment</mat-icon>
                </a>
              }
              @if (r.disbursedAt) {
                <button mat-icon-button (click)="openContract(r.id)" matTooltip="Ver contrato PDF">
                  <mat-icon>picture_as_pdf</mat-icon>
                </button>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;"
              [class.row-overdue]="row.status === 'VENCIDO'"
              [class.row-atrasado]="row.status === 'ATRASADO'"
              [routerLink]="['/loans', row.id]"></tr>
        </table>

        @if (loans().length === 0) {
          <div class="empty-state">
            <mat-icon>account_balance_wallet</mat-icon>
            <p>No se encontraron préstamos con los filtros aplicados</p>
          </div>
        }

        <mat-paginator
          [length]="total()"
          [pageSize]="pageSize"
          [pageSizeOptions]="[10, 20, 50, 100]"
          (page)="onPage($event)">
        </mat-paginator>
      }
    </mat-card>
  `,
  styles: [`
    .kpi-pill.atrasado { background: linear-gradient(135deg, #FB923C, #C2410C); }
    .row-atrasado { background:#FFF7ED !important; }
  `],
})
export class PortfolioComponent implements OnInit {
  private api = inject(ApiService);
  private pdfSvc = inject(PdfDownloadService);

  loans = signal<Loan[]>([]);
  total = signal(0);
  loading = signal(true);
  lastUpdate = signal(new Date());
  summary = signal({ active: 0, atrasados: 0, overdue: 0, restructured: 0, settled: 0, totalActiveAmount: 0 });

  cols = ['customer', 'type', 'amount', 'payment', 'disbursed', 'status', 'actions'];
  page = 0;
  pageSize = 20;

  searchCtrl = new FormControl('');
  statusCtrl = new FormControl('');

  ngOnInit() {
    this.load();
    // Autorefresh cada 60 segundos
    interval(60000).subscribe(() => this.load());

    this.searchCtrl.valueChanges.pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => { this.page = 0; this.load(); });
    this.statusCtrl.valueChanges
      .subscribe(() => { this.page = 0; this.load(); });
  }

  load() {
    this.loading.set(true);
    this.api.get<PagedResponse<Loan>>('/loans', {
      page: this.page + 1,
      limit: this.pageSize,
      status: this.statusCtrl.value || undefined,
      search: this.searchCtrl.value || undefined,
    }).subscribe({
      next: (r) => {
        this.loans.set(r.data);
        this.total.set(r.total);
        this.lastUpdate.set(new Date());
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.api.get<any>('/reports/portfolio').subscribe({
      next: (s) => this.summary.set(s),
    });
  }

  onPage(e: PageEvent) { this.page = e.pageIndex; this.pageSize = e.pageSize; this.load(); }
  clearFilters() { this.searchCtrl.setValue(''); this.statusCtrl.setValue(''); }
  openContract(id: string) { this.pdfSvc.open(`/loans/${id}/pdf`); }
}
