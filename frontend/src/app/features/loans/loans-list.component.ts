import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { ApiService, AuthService, Loan, LoanStatus, PagedResponse } from '../../core/index';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  SOLICITUD:      { label: 'Pendiente',      color: 'primary' },
  AUTORIZADO:     { label: 'Autorizado',     color: 'accent' },
  RECHAZADO:      { label: 'Rechazado',      color: 'warn' },
  ACTIVO:         { label: 'Activo',         color: '' },
  ATRASADO:       { label: 'Atrasado',       color: 'warn' },
  VENCIDO:        { label: 'Vencido',        color: 'warn' },
  REESTRUCTURADO: { label: 'Reestructurado', color: 'accent' },
  LIQUIDADO:      { label: 'Liquidado',      color: '' },
  CASTIGADO:      { label: 'Castigado',      color: 'warn' },
  CONVENIO:       { label: 'Convenio',       color: 'accent' },
};

@Component({
  selector: 'app-loans-list',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule, CurrencyPipe, DatePipe,
    MatTableModule, MatPaginatorModule, MatSortModule, MatButtonModule,
    MatIconModule, MatInputModule, MatSelectModule, MatFormFieldModule,
    MatChipsModule, MatCardModule, MatProgressSpinnerModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1>Préstamos</h1>
      <div class="header-actions">
        <a mat-stroked-button routerLink="/loans/simulator">
          <mat-icon>calculate</mat-icon> Simulador
        </a>
        @if (auth.can('prestamos.crear')) {
          <a mat-raised-button color="primary" routerLink="/loans/new">
            <mat-icon>add</mat-icon> Nueva solicitud
          </a>
        }
      </div>
    </div>

    <!-- Filtros -->
    <mat-card class="filters-card">
      <div class="filters-row">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Estado</mat-label>
          <mat-select [formControl]="statusFilter">
            <mat-option value="">Todos</mat-option>
            @for (s of statuses; track s.value) {
              <mat-option [value]="s.value">{{ s.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
    </mat-card>

    <!-- Tabla -->
    <mat-card>
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
        </div>
      } @else {
        <table mat-table [dataSource]="loans()" class="w-full">
          <!-- ID -->
          <ng-container matColumnDef="id">
            <th mat-header-cell *matHeaderCellDef>ID</th>
            <td mat-cell *matCellDef="let row">
              <code class="loan-id">{{ row.id | slice:0:8 }}...</code>
            </td>
          </ng-container>

          <!-- Cliente -->
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef>Cliente</th>
            <td mat-cell *matCellDef="let row">
              <div class="customer-cell">
                <span class="customer-name">{{ row.customer?.fullName }}</span>
                <span class="customer-phone">{{ row.customer?.phone }}</span>
              </div>
            </td>
          </ng-container>

          <!-- Monto -->
          <ng-container matColumnDef="amount">
            <th mat-header-cell *matHeaderCellDef>Monto</th>
            <td mat-cell *matCellDef="let row">
              {{ row.principalAmount | currency:'MXN':'symbol':'1.2-2' }}
            </td>
          </ng-container>

          <!-- Plazo -->
          <ng-container matColumnDef="term">
            <th mat-header-cell *matHeaderCellDef>Plazo</th>
            <td mat-cell *matCellDef="let row">{{ row.termWeeks }} días</td>
          </ng-container>

          <!-- Cuota -->
          <ng-container matColumnDef="payment">
            <th mat-header-cell *matHeaderCellDef>Cuota</th>
            <td mat-cell *matCellDef="let row">
              {{ row.periodicPayment | currency:'MXN':'symbol':'1.2-2' }}
            </td>
          </ng-container>

          <!-- Estado -->
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let row">
              <span class="status-badge status-{{ row.status | lowercase }}">
                {{ statusLabel(row.status) }}
              </span>
            </td>
          </ng-container>

          <!-- Fecha -->
          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef>Fecha</th>
            <td mat-cell *matCellDef="let row">{{ row.createdAt | date:'dd/MM/yyyy' }}</td>
          </ng-container>

          <!-- Acciones -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let row">
              <button mat-icon-button [routerLink]="['/loans', row.id]" matTooltip="Ver detalle">
                <mat-icon>visibility</mat-icon>
              </button>
              @if (['ATRASADO', 'VENCIDO'].includes(row.status) && auth.can('prestamos.reestructurar')) {
                <button mat-icon-button [routerLink]="['/loans', row.id, 'restructure']" matTooltip="Reestructurar" color="accent">
                  <mat-icon>refresh</mat-icon>
                </button>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"
              class="table-row" [routerLink]="['/loans', row.id]"></tr>
        </table>

        <mat-paginator
          [length]="total()"
          [pageSize]="pageSize"
          [pageSizeOptions]="[10, 20, 50]"
          (page)="onPage($event)"
        ></mat-paginator>
      }
    </mat-card>
  `
})
export class LoansListComponent implements OnInit {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);

  loans = signal<Loan[]>([]);
  total = signal(0);
  loading = signal(true);
  page = 0;
  pageSize = 20;

  statusFilter = new FormControl('');
  displayedColumns = ['id', 'customer', 'amount', 'term', 'payment', 'status', 'date', 'actions'];
  statuses = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label }));

  ngOnInit() {
    this.loadLoans();
    this.statusFilter.valueChanges.pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => { this.page = 0; this.loadLoans(); });
  }

  loadLoans() {
    this.loading.set(true);
    this.api.get<PagedResponse<Loan>>('/loans', {
      status: this.statusFilter.value || undefined,
      page: this.page + 1,
      limit: this.pageSize,
    }).subscribe({
      next: (res) => { this.loans.set(res.data); this.total.set(res.total); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onPage(event: PageEvent) {
    this.page = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadLoans();
  }

  statusLabel(status: string) { return STATUS_CONFIG[status]?.label || status; }
}