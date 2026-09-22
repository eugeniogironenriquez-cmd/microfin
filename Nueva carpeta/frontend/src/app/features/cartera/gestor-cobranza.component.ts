import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-gestor-cobranza',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatTableModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>support_agent</mat-icon> Gestión de cobranza</h1>
      <button mat-stroked-button (click)="load()">
        <mat-icon>refresh</mat-icon> Actualizar
      </button>
    </div>

    <div class="alert-rojo">
      <mat-icon>priority_high</mat-icon>
      <div>
        <strong>Créditos en situación crítica</strong>
        <p>Estos créditos tienen más cuotas vencidas que el umbral permitido y requieren gestión inmediata.</p>
      </div>
      <div class="count-badge">{{ rows().length }}</div>
    </div>

    <mat-card>
      <mat-card-content>
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Buscar cliente</mat-label>
          <input matInput [value]="search()" (input)="onSearch($event)"
                 placeholder="Nombre o teléfono">
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>

        @if (loading()) {
          <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
        } @else if (rows().length === 0) {
          <div class="empty-state">
            <mat-icon>sentiment_satisfied</mat-icon>
            <p>No hay créditos en situación crítica. ¡Buen trabajo!</p>
          </div>
        } @else {
          <table mat-table [dataSource]="rows()" class="w-full">
            <ng-container matColumnDef="cliente">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let r">
                <div class="cli-name">{{ r.customerName }}</div>
                <div class="cli-phone">
                  <mat-icon class="phone-ico">phone</mat-icon> {{ r.customerPhone }}
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="atrasos">
              <th mat-header-cell *matHeaderCellDef>Cuotas vencidas</th>
              <td mat-cell *matCellDef="let r">
                <span class="atraso-badge">{{ r.overdueCount }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="monto">
              <th mat-header-cell *matHeaderCellDef>Monto</th>
              <td mat-cell *matCellDef="let r">{{ r.principalAmount | currency:'MXN' }}</td>
            </ng-container>
            <ng-container matColumnDef="cuota">
              <th mat-header-cell *matHeaderCellDef>Cuota diaria</th>
              <td mat-cell *matCellDef="let r">{{ r.periodicPayment | currency:'MXN' }}</td>
            </ng-container>
            <ng-container matColumnDef="desembolso">
              <th mat-header-cell *matHeaderCellDef>Desembolso</th>
              <td mat-cell *matCellDef="let r">{{ r.disbursedAt | date:'dd/MM/yyyy':'UTC' }}</td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let r">
                <button mat-stroked-button color="primary" (click)="verCredito(r.id)">
                  <mat-icon>visibility</mat-icon> Ver
                </button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;" class="row-rojo"></tr>
          </table>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .alert-rojo {
      display:flex; align-items:center; gap:14px; padding:16px 18px;
      background:#FEF2F2; border:1px solid #FECACA; border-radius:12px;
      margin-bottom:16px;
    }
    .alert-rojo mat-icon { color:#DC2626; font-size:28px; width:28px; height:28px; }
    .alert-rojo strong { color:#991B1B; }
    .alert-rojo p { margin:2px 0 0; font-size:13px; color:#B91C1C; }
    .count-badge {
      margin-left:auto; background:#DC2626; color:#fff; font-weight:700;
      font-size:20px; min-width:44px; height:44px; border-radius:22px;
      display:flex; align-items:center; justify-content:center; padding:0 10px;
    }
    .search-field { width:320px; max-width:100%; }
    .w-full { width:100%; }
    .cli-name { font-weight:600; font-size:14px; }
    .cli-phone { font-size:12px; color:#718096; display:flex; align-items:center; gap:3px; }
    .phone-ico { font-size:13px; width:13px; height:13px; }
    .atraso-badge {
      display:inline-block; min-width:32px; text-align:center;
      padding:3px 10px; border-radius:12px; font-weight:700; font-size:14px;
      background:#FEF2F2; color:#DC2626;
    }
    .row-rojo { background:#FFF5F5 !important; }
    .loading-overlay { display:flex; justify-content:center; padding:40px; }
    .empty-state { text-align:center; padding:40px; color:#718096; }
    .empty-state mat-icon { font-size:48px; width:48px; height:48px; color:#16A34A; }
  `],
})
export class GestorCobranzaComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  rows    = signal<any[]>([]);
  loading = signal(true);
  search  = signal('');

  cols = ['cliente', 'atrasos', 'monto', 'cuota', 'desembolso', 'acciones'];

  private searchSubject = new Subject<string>();

  ngOnInit() {
    this.searchSubject.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.load());
    this.load();
  }

  load() {
    this.loading.set(true);
    const params: any = {};
    if (this.search()) params.search = this.search();
    this.api.get<any>('/semaforo/gestor', params).subscribe({
      next: (r) => { this.rows.set(r?.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onSearch(event: Event) {
    this.search.set((event.target as HTMLInputElement).value);
    this.searchSubject.next(this.search());
  }

  verCredito(id: string) { this.router.navigate(['/loans', id]); }
}
