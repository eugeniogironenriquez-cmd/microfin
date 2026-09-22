import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-proximos-liquidar',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe,
    MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>flag</mat-icon> Próximos a liquidar</h1>
      <button mat-stroked-button (click)="load()">
        <mat-icon>refresh</mat-icon> Actualizar
      </button>
    </div>

    <div class="info-banner">
      <mat-icon>info</mat-icon>
      <div>
        <strong>Créditos por terminar</strong>
        <p>Estos créditos tienen 3 o menos cuotas pendientes. Cuando liquiden, podrás ofrecer una renovación.</p>
      </div>
      <div class="count-badge">{{ rows().length }}</div>
    </div>

    <mat-card>
      <mat-card-content>
        @if (loading()) {
          <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
        } @else if (rows().length === 0) {
          <div class="empty-state">
            <mat-icon>schedule</mat-icon>
            <p>No hay créditos próximos a liquidar.</p>
          </div>
        } @else {
          <table mat-table [dataSource]="rows()" class="w-full">
            <ng-container matColumnDef="cliente">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let r">
                <div class="cli-name">{{ r.customerName }}</div>
                <div class="cli-phone">{{ r.customerPhone }}</div>
              </td>
            </ng-container>
            <ng-container matColumnDef="pendientes">
              <th mat-header-cell *matHeaderCellDef>Cuotas restantes</th>
              <td mat-cell *matCellDef="let r">
                <span class="pend-badge" [class.pend-1]="r.cuotasPendientes === 1">
                  {{ r.cuotasPendientes }}
                </span>
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
            <ng-container matColumnDef="estatus">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let r">
                <span class="badge badge-{{ r.status | lowercase }}">{{ r.status }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let r">
                <button mat-icon-button color="primary" (click)="verCredito(r.id)" title="Ver crédito">
                  <mat-icon>visibility</mat-icon>
                </button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"
                [class.casi]="row.cuotasPendientes === 1"></tr>
          </table>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .info-banner {
      display:flex; align-items:center; gap:14px; padding:16px 18px;
      background:#EFF6FF; border:1px solid #BFDBFE; border-radius:12px;
      margin-bottom:16px;
    }
    .info-banner mat-icon { color:#2563EB; font-size:28px; width:28px; height:28px; }
    .info-banner strong { color:#1E40AF; }
    .info-banner p { margin:2px 0 0; font-size:13px; color:#1E40AF; }
    .count-badge {
      margin-left:auto; background:#2563EB; color:#fff; font-weight:700;
      font-size:20px; min-width:44px; height:44px; border-radius:22px;
      display:flex; align-items:center; justify-content:center; padding:0 10px;
    }
    .w-full { width:100%; }
    .cli-name { font-weight:600; font-size:14px; }
    .cli-phone { font-size:12px; color:#718096; }
    .pend-badge {
      display:inline-block; min-width:32px; text-align:center;
      padding:3px 10px; border-radius:12px; font-weight:700; font-size:14px;
      background:#EFF6FF; color:#2563EB;
    }
    .pend-badge.pend-1 { background:#F0FFF4; color:#16A34A; }
    .casi { background:#F0FFF4 !important; }
    .loading-overlay { display:flex; justify-content:center; padding:40px; }
    .empty-state { text-align:center; padding:40px; color:#718096; }
    .empty-state mat-icon { font-size:48px; width:48px; height:48px; }
  `],
})
export class ProximosLiquidarComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  rows    = signal<any[]>([]);
  loading = signal(true);

  cols = ['cliente', 'pendientes', 'monto', 'cuota', 'estatus', 'acciones'];

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.get<any>('/loans/reportes/proximos-liquidar').subscribe({
      next: (r) => { this.rows.set(r?.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  verCredito(id: string) { this.router.navigate(['/loans', id]); }
}