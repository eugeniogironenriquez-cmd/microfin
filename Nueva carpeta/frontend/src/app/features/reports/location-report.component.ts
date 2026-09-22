import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-location-report',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatTableModule, MatProgressSpinnerModule,
    MatPaginatorModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>map</mat-icon> Reporte por ubicación</h1>
      <button mat-raised-button color="primary" (click)="exportExcel()" [disabled]="loans().length === 0">
        <mat-icon>download</mat-icon> Exportar Excel
      </button>
    </div>

    <!-- Filtros -->
    <mat-card class="filters-card">
      <h3 class="section-title">Filtros</h3>
      <form [formGroup]="filterForm" (ngSubmit)="search()" class="filters-grid">

        <mat-form-field appearance="outline">
          <mat-label>Estado</mat-label>
          <mat-select formControlName="stateId" (selectionChange)="onStateChange()">
            <mat-option value="">Todos los estados</mat-option>
            @for (s of states(); track s.id) {
              <mat-option [value]="s.id">{{ s.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Municipio</mat-label>
          <mat-select formControlName="municipalityId" [disabled]="!filterForm.value.stateId">
            <mat-option value="">Todos los municipios</mat-option>
            @for (m of municipalities(); track m.id) {
              <mat-option [value]="m.id">{{ m.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Estado del préstamo</mat-label>
          <mat-select formControlName="loanStatus">
            <mat-option value="">Todos</mat-option>
            <mat-option value="ACTIVO">Activo</mat-option>
            <mat-option value="VENCIDO">Vencido</mat-option>
            <mat-option value="SOLICITUD">Solicitud</mat-option>
            <mat-option value="AUTORIZADO">Autorizado</mat-option>
            <mat-option value="LIQUIDADO">Liquidado</mat-option>
            <mat-option value="REESTRUCTURADO">Reestructurado</mat-option>
          </mat-select>
        </mat-form-field>

        <div class="filter-actions">
          <button mat-stroked-button type="button" (click)="clearFilters()">
            <mat-icon>filter_alt_off</mat-icon> Limpiar
          </button>
          <button mat-raised-button color="primary" type="submit" [disabled]="searching()">
            @if (searching()) { <mat-spinner diameter="18"></mat-spinner> }
            @else { <mat-icon>search</mat-icon> }
            Buscar
          </button>
        </div>
      </form>
    </mat-card>

    <!-- Resumen -->
    @if (searched() && !searching()) {
      <div class="kpi-grid summary-kpis">
        <div class="kpi-card">
          <div class="kpi-icon"><mat-icon>list</mat-icon></div>
          <div class="kpi-value">{{ total() }}</div>
          <div class="kpi-label">Préstamos encontrados</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><mat-icon>account_balance_wallet</mat-icon></div>
          <div class="kpi-value">{{ totalAmount() | currency:'MXN':'symbol':'1.0-0' }}</div>
          <div class="kpi-label">Monto total</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><mat-icon>warning</mat-icon></div>
          <div class="kpi-value">{{ overdueCount() }}</div>
          <div class="kpi-label">Vencidos</div>
        </div>
      </div>

      <!-- Tabla -->
      <mat-card>
        @if (loans().length === 0) {
          <div class="empty-state">
            <mat-icon>search_off</mat-icon>
            <p>No se encontraron préstamos con los filtros aplicados</p>
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
            <ng-container matColumnDef="location">
              <th mat-header-cell *matHeaderCellDef>Ubicación</th>
              <td mat-cell *matCellDef="let r">
                {{ r.customer?.municipality?.name || '—' }},
                {{ r.customer?.state?.name || '—' }}
              </td>
            </ng-container>
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef>Monto</th>
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
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let r">
                <span class="badge badge-{{ r.status | lowercase }}">{{ r.status }}</span>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>
          </table>
          <mat-paginator [length]="total()" [pageSize]="pageSize"
                         [pageSizeOptions]="[10,20,50,100]" (page)="onPage($event)">
          </mat-paginator>
        }
      </mat-card>
    }
  `
})
export class LocationReportComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);

  states = signal<any[]>([]);
  municipalities = signal<any[]>([]);
  loans = signal<any[]>([]);
  total = signal(0);
  searching = signal(false);
  searched = signal(false);
  page = 0;
  pageSize = 20;
  cols = ['customer', 'location', 'amount', 'payment', 'disbursed', 'status'];

  totalAmount = signal(0);
  overdueCount = signal(0);

  filterForm = this.fb.group({
    stateId: [''],
    municipalityId: [''],
    loanStatus: [''],
  });

  ngOnInit() {
    this.api.get<any[]>('/locations/states').subscribe({ next: (s) => this.states.set(s) });
  }

  onStateChange() {
    this.filterForm.patchValue({ municipalityId: '' });
    const stateId = this.filterForm.value.stateId;
    if (stateId) {
      this.api.get<any[]>(`/locations/states/${stateId}/municipalities`).subscribe({
        next: (m) => this.municipalities.set(m),
      });
    } else {
      this.municipalities.set([]);
    }
  }

  search() {
    this.searching.set(true);
    this.searched.set(true);
    const { stateId, municipalityId, loanStatus } = this.filterForm.value;
    this.api.get<any>('/loans', {
      stateId: stateId || undefined,
      municipalityId: municipalityId || undefined,
      status: loanStatus || undefined,
      page: this.page + 1,
      limit: this.pageSize,
    }).subscribe({
      next: (r) => {
        this.loans.set(r.data);
        this.total.set(r.total);
        this.totalAmount.set(r.data.reduce((sum: number, l: any) => sum + Number(l.principalAmount), 0));
        this.overdueCount.set(r.data.filter((l: any) => l.status === 'VENCIDO').length);
        this.searching.set(false);
      },
      error: () => this.searching.set(false),
    });
  }

  clearFilters() {
    this.filterForm.reset();
    this.municipalities.set([]);
    this.loans.set([]);
    this.searched.set(false);
  }

  exportExcel() {
    const { stateId, municipalityId, loanStatus } = this.filterForm.value;
    const params = new URLSearchParams();
    if (stateId) params.set('stateId', stateId);
    if (municipalityId) params.set('municipalityId', String(municipalityId));
    if (loanStatus) params.set('status', loanStatus);
    window.open(`/api/v1/reports/export/location?${params}`, '_blank');
  }

  onPage(e: PageEvent) { this.page = e.pageIndex; this.pageSize = e.pageSize; this.search(); }
}
