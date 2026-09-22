import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService, AuthService, Customer, PagedResponse } from '../../core/index';

@Component({
  selector: 'app-customers-list',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatTableModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatInputModule, MatFormFieldModule, MatCardModule, MatProgressSpinnerModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1>Clientes</h1>
      @if (auth.can('clientes.crear')) {
        <a mat-raised-button color="primary" routerLink="/customers/new">
          <mat-icon>person_add</mat-icon> Nuevo cliente
        </a>
      }
    </div>

    <mat-card class="mb-16">
      <mat-form-field appearance="outline" class="w-full search-field">
        <mat-label>Buscar por nombre, CURP o teléfono</mat-label>
        <input matInput [formControl]="searchCtrl" placeholder="Ej: Juan García o GARC901212...">
        <mat-icon matPrefix>search</mat-icon>
        @if (searchCtrl.value) {
          <button matSuffix mat-icon-button (click)="searchCtrl.setValue('')">
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>
    </mat-card>

    <mat-card>
      @if (loading()) {
        <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
      } @else {
        <table mat-table [dataSource]="customers()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Cliente</th>
            <td mat-cell *matCellDef="let r">
              <div class="customer-cell">
                <span class="name">{{ r.fullName }}</span>
                <span class="curp">{{ r.curp }}</span>
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="phone">
            <th mat-header-cell *matHeaderCellDef>Teléfono</th>
            <td mat-cell *matCellDef="let r">{{ r.phone }}</td>
          </ng-container>
          <ng-container matColumnDef="age">
            <th mat-header-cell *matHeaderCellDef>Edad</th>
            <td mat-cell *matCellDef="let r">{{ calcAge(r.birthDate) }}</td>
          </ng-container>
          <ng-container matColumnDef="occupation">
            <th mat-header-cell *matHeaderCellDef>Ocupación</th>
            <td mat-cell *matCellDef="let r">{{ r.occupation || '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let r">
              <span class="status-badge status-{{ r.status | lowercase }}">{{ r.status }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let r">
              <button mat-icon-button [routerLink]="['/customers', r.id]" matTooltip="Ver detalle">
                <mat-icon>visibility</mat-icon>
              </button>
              @if (auth.can('clientes.editar')) {
                <button mat-icon-button [routerLink]="['/customers', r.id, 'edit']" matTooltip="Editar">
                  <mat-icon>edit</mat-icon>
                </button>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;"
              class="table-row" [routerLink]="['/customers', row.id]"></tr>
        </table>

        @if (customers().length === 0) {
          <div class="empty-state">
            <mat-icon>people_outline</mat-icon>
            <p>No se encontraron clientes</p>
          </div>
        }

        <mat-paginator [length]="total()" [pageSize]="20"
                       [pageSizeOptions]="[10,20,50]" (page)="onPage($event)">
        </mat-paginator>
      }
    </mat-card>
  `
})
export class CustomersListComponent implements OnInit {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);

  customers = signal<Customer[]>([]);
  total = signal(0);
  loading = signal(true);
  cols = ['name', 'phone', 'age', 'occupation', 'status', 'actions'];
  searchCtrl = new FormControl('');
  page = 0; pageSize = 20;

  calcAge(birthDate: any): string {
    if (!birthDate) return '—';
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return '—';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 0 ? `${age}` : '—';
  }

  ngOnInit() {
    this.load();
    this.searchCtrl.valueChanges.pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => { this.page = 0; this.load(); });
  }

  load() {
    this.loading.set(true);
    this.api.get<PagedResponse<Customer>>('/customers', {
      search: this.searchCtrl.value || undefined,
      page: this.page + 1, limit: this.pageSize,
    }).subscribe({
      next: (r) => { this.customers.set(r.data); this.total.set(r.total); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onPage(e: PageEvent) { this.page = e.pageIndex; this.pageSize = e.pageSize; this.load(); }
}