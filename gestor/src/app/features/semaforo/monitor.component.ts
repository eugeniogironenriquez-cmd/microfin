import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { GestorService } from '../../core/gestor.service';
import { CreditoSemaforo, MonitorResumen, NivelSemaforo } from '../../core/models';

@Component({
  selector: 'app-monitor',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatIconModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatProgressSpinnerModule, MatTableModule, MatTooltipModule,
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1><mat-icon>monitor_heart</mat-icon> Monitor de cartera</h1>
        <button mat-stroked-button (click)="cargar()">
          <mat-icon>refresh</mat-icon> Actualizar
        </button>
      </div>

      <!-- Tarjetas del semáforo -->
      <div class="semaforo-cards">
        <button class="sf-card verde" [class.sel]="filtro() === 'VERDE'" (click)="toggleFiltro('VERDE')">
          <span class="dot dot-verde"></span>
          <span class="sf-num">{{ resumen().verde }}</span>
          <span class="sf-lbl">Al corriente</span>
        </button>
        <button class="sf-card amarillo" [class.sel]="filtro() === 'AMARILLO'" (click)="toggleFiltro('AMARILLO')">
          <span class="dot dot-amarillo"></span>
          <span class="sf-num">{{ resumen().amarillo }}</span>
          <span class="sf-lbl">En riesgo <small>(1–5 vencidas)</small></span>
        </button>
        <button class="sf-card rojo" [class.sel]="filtro() === 'ROJO'" (click)="toggleFiltro('ROJO')">
          <span class="dot dot-rojo"></span>
          <span class="sf-num">{{ resumen().rojo }}</span>
          <span class="sf-lbl">Crítico <small>(+5 vencidas)</small></span>
        </button>
        <div class="sf-card total">
          <mat-icon>account_balance_wallet</mat-icon>
          <span class="sf-num">{{ resumen().total }}</span>
          <span class="sf-lbl">Total de créditos</span>
        </div>
      </div>

      <!-- Buscador -->
      <mat-form-field appearance="outline" class="search">
        <mat-label>Buscar por cliente o teléfono</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [(ngModel)]="search" (keyup.enter)="cargar()" placeholder="Nombre, teléfono...">
        @if (search) {
          <button mat-icon-button matSuffix (click)="search=''; cargar()"><mat-icon>close</mat-icon></button>
        }
      </mat-form-field>

      <!-- Tabla -->
      <mat-card class="tabla-card">
        @if (loading()) {
          <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
        } @else if (creditosFiltrados().length === 0) {
          <div class="empty">
            <mat-icon>inbox</mat-icon>
            <p>No hay créditos que mostrar con este filtro.</p>
          </div>
        } @else {
          <table mat-table [dataSource]="creditosFiltrados()" class="full-table">
            <ng-container matColumnDef="nivel">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let c">
                <span class="dot" [ngClass]="dotClass(c.nivel)"
                      [matTooltip]="nivelLabel(c.nivel)"></span>
              </td>
            </ng-container>

            <ng-container matColumnDef="cliente">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let c">
                <div class="cli-name">{{ c.customerName }}</div>
                @if (c.phone) { <div class="cli-sub">{{ c.phone }}</div> }
              </td>
            </ng-container>

            <ng-container matColumnDef="vencidas">
              <th mat-header-cell *matHeaderCellDef>Cuotas vencidas</th>
              <td mat-cell *matCellDef="let c">
                <span class="nivel-chip" [ngClass]="chipClass(c.nivel)">
                  {{ c.cuotasVencidas }}
                </span>
              </td>
            </ng-container>

            <ng-container matColumnDef="saldo">
              <th mat-header-cell *matHeaderCellDef>Saldo</th>
              <td mat-cell *matCellDef="let c">
                {{ c.saldoPendiente != null ? (c.saldoPendiente | currency:'MXN':'symbol':'1.2-2') : '—' }}
              </td>
            </ng-container>

            <ng-container matColumnDef="accion">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let c">
                <button mat-flat-button color="primary" (click)="abrir(c)">
                  Gestionar <mat-icon>chevron_right</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>
          </table>
        }
      </mat-card>
    </div>
  `,
  styles: [`
    .semaforo-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .sf-card {
      background: #fff; border: 2px solid transparent; border-radius: var(--radius);
      padding: 18px; text-align: left; cursor: pointer;
      display: flex; flex-direction: column; gap: 4px;
      box-shadow: var(--shadow-sm);
      transition: transform .12s, border-color .12s, box-shadow .12s;
      font-family: inherit;
    }
    .sf-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .sf-card .sf-num { font-size: 30px; font-weight: 700; color: var(--gray-900); }
    .sf-card .sf-lbl { font-size: 13px; color: var(--gray-600); }
    .sf-card .sf-lbl small { color: var(--gray-400); }
    .sf-card .dot { width: 14px; height: 14px; }
    .sf-card mat-icon { color: var(--blue-500); }
    .sf-card.total { cursor: default; }
    .sf-card.verde.sel    { border-color: var(--verde); background: #f0fdf4; }
    .sf-card.amarillo.sel { border-color: var(--amarillo); background: #fffbeb; }
    .sf-card.rojo.sel     { border-color: var(--rojo); background: #fef2f2; }

    .search { width: 100%; max-width: 420px; margin-bottom: 12px; }

    .tabla-card { padding: 0; overflow: hidden; }
    .full-table { width: 100%; }
    .cli-name { font-weight: 600; color: var(--gray-900); }
    .cli-sub { font-size: 12px; color: var(--gray-600); }
    .center { display: flex; justify-content: center; padding: 48px; }
    .empty { text-align: center; padding: 48px; color: var(--gray-600); }
    .empty mat-icon { font-size: 48px; width: 48px; height: 48px; color: var(--gray-200); }
    td.mat-mdc-cell { padding: 10px 12px; }

    @media (max-width: 599px) {
      .mat-column-saldo { display: none; }
    }
  `],
})
export class MonitorComponent implements OnInit {
  private gestor = inject(GestorService);
  private router = inject(Router);

  cols = ['nivel', 'cliente', 'vencidas', 'saldo', 'accion'];
  loading = signal(true);
  creditos = signal<CreditoSemaforo[]>([]);
  resumen = signal<MonitorResumen>({ verde: 0, amarillo: 0, rojo: 0, total: 0 });
  filtro = signal<NivelSemaforo | null>(null);
  search = '';

  creditosFiltrados = computed(() => {
    const f = this.filtro();
    const list = this.creditos();
    return f ? list.filter((c) => c.nivel === f) : list;
  });

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.gestor.getMonitor({ search: this.search || undefined }).subscribe({
      next: (res) => {
        this.creditos.set(res.creditos);
        if (res.resumen) this.resumen.set(res.resumen);
        this.loading.set(false);
      },
      error: () => {
        this.creditos.set([]);
        this.loading.set(false);
      },
    });
  }

  toggleFiltro(nivel: NivelSemaforo) {
    this.filtro.set(this.filtro() === nivel ? null : nivel);
  }

  abrir(c: CreditoSemaforo) {
    this.router.navigate(['/credito', c.loanId], {
      state: { credito: c },
    });
  }

  dotClass(n: NivelSemaforo) {
    return { VERDE: 'dot-verde', AMARILLO: 'dot-amarillo', ROJO: 'dot-rojo' }[n];
  }
  chipClass(n: NivelSemaforo) {
    return { VERDE: 'nivel-verde', AMARILLO: 'nivel-amarillo', ROJO: 'nivel-rojo' }[n];
  }
  nivelLabel(n: NivelSemaforo) {
    return { VERDE: 'Al corriente', AMARILLO: 'En riesgo', ROJO: 'Crítico' }[n];
  }
}
