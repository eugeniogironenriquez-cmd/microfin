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
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

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

      <!-- Resumen de la cartera en rojo (vista fija: solo créditos críticos) -->
      <div class="rojo-banner">
        <div class="rb-dot"></div>
        <div class="rb-info">
          <span class="rb-num">{{ creditosFiltrados().length }}</span>
          <span class="rb-label">créditos en rojo (más de 5 atrasos / vencidos)</span>
        </div>
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
          } @else if (creditosFiltrados().length === 0) {
            <div class="empty-state">
              <mat-icon>check_circle</mat-icon>
              <p>No hay créditos en rojo por gestionar.</p>
            </div>
          } @else {
            <table mat-table [dataSource]="creditosFiltrados()" class="w-full">
              <ng-container matColumnDef="nivel">
                <th mat-header-cell *matHeaderCellDef>Semáforo</th>
                <td mat-cell *matCellDef="let r">
                  <span class="nivel-dot nivel-{{ r.nivel | lowercase }}"
                        [matTooltip]="nivelLabel(r.nivel)"></span>
                </td>
              </ng-container>
              <ng-container matColumnDef="cliente">
                <th mat-header-cell *matHeaderCellDef>Cliente</th>
                <td mat-cell *matCellDef="let r">
                  <div class="cli-name">{{ r.customerName }}</div>
                  <div class="cli-phone">{{ r.phone }}</div>
                </td>
              </ng-container>
              <ng-container matColumnDef="atrasos">
                <th mat-header-cell *matHeaderCellDef>Cuotas vencidas</th>
                <td mat-cell *matCellDef="let r">
                  <span class="atraso-badge atraso-{{ r.nivel | lowercase }}">{{ r.cuotasVencidas }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="monto">
                <th mat-header-cell *matHeaderCellDef>Monto</th>
                <td mat-cell *matCellDef="let r">
                  {{ r.principalAmount != null ? (r.principalAmount | currency:'MXN') : '—' }}
                </td>
              </ng-container>
              <ng-container matColumnDef="cuota">
                <th mat-header-cell *matHeaderCellDef>Cuota</th>
                <td mat-cell *matCellDef="let r">
                  {{ r.periodicPayment != null ? (r.periodicPayment | currency:'MXN') : '—' }}
                </td>
              </ng-container>
              <ng-container matColumnDef="saldo">
                <th mat-header-cell *matHeaderCellDef>Saldo</th>
                <td mat-cell *matCellDef="let r">
                  {{ r.saldoPendiente != null ? (r.saldoPendiente | currency:'MXN') : '—' }}
                </td>
              </ng-container>
              <ng-container matColumnDef="estatus">
                <th mat-header-cell *matHeaderCellDef>Estado</th>
                <td mat-cell *matCellDef="let r">
                  <span class="badge badge-{{ (r.status || '') | lowercase }}">{{ r.status || '—' }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="acciones">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let r">
                  <button mat-flat-button color="primary" (click)="abrir(r)">
                    Gestionar <mat-icon>chevron_right</mat-icon>
                  </button>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="cols"></tr>
              <tr mat-row *matRowDef="let row; columns: cols;"
                  [class.row-rojo]="row.nivel === 'ROJO'"
                  [class.row-amarillo]="row.nivel === 'AMARILLO'"></tr>
            </table>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .rojo-banner {
      display:flex; align-items:center; gap:14px; padding:16px 18px;
      margin-bottom:16px; border-radius:14px; background:#FEF2F2;
      border:1px solid #FECACA;
    }
    .rb-dot {
      width:20px; height:20px; border-radius:50%; flex-shrink:0;
      background:#DC2626; box-shadow:0 0 0 4px #FECACA;
    }
    .rb-info { display:flex; align-items:baseline; gap:8px; }
    .rb-num { font-size:26px; font-weight:700; color:#DC2626; line-height:1; }
    .rb-label { font-size:13px; color:#991B1B; }
    .semaforo-grid {
      display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px;
    }
    @media(max-width:800px){ .semaforo-grid { grid-template-columns:1fr 1fr; } }
    .sem-card {
      display:flex; align-items:center; gap:14px; padding:18px 16px;
      border-radius:14px; cursor:pointer; border:2px solid transparent;
      background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.06); transition:.15s;
    }
    .sem-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.12); }
    .sem-card.active { border-color:#1C4532; }
    .sem-total { cursor:default; }
    .sem-dot { width:20px; height:20px; border-radius:50%; flex-shrink:0; }
    .sem-verde    .sem-dot { background:#16A34A; box-shadow:0 0 0 4px #BBF7D0; }
    .sem-amarillo .sem-dot { background:#F59E0B; box-shadow:0 0 0 4px #FDE68A; }
    .sem-rojo     .sem-dot { background:#DC2626; box-shadow:0 0 0 4px #FECACA; }
    .sem-info { display:flex; flex-direction:column; }
    .sem-num { font-size:26px; font-weight:700; line-height:1; }
    .sem-label { font-size:12px; color:#718096; margin-top:2px; }

    .search-field { width:320px; max-width:100%; }
    .w-full { width:100%; }
    .cli-name { font-weight:600; font-size:14px; }
    .cli-phone { font-size:12px; color:#718096; }
    .nivel-dot { display:inline-block; width:16px; height:16px; border-radius:50%; }
    .nivel-verde    { background:#16A34A; }
    .nivel-amarillo { background:#F59E0B; }
    .nivel-rojo     { background:#DC2626; }
    .atraso-badge {
      display:inline-block; min-width:28px; text-align:center;
      padding:2px 8px; border-radius:12px; font-weight:700; font-size:13px;
    }
    .atraso-verde    { background:#F0FFF4; color:#16A34A; }
    .atraso-amarillo { background:#FFFBEB; color:#D97706; }
    .atraso-rojo     { background:#FEF2F2; color:#DC2626; }
    .badge {
      display:inline-block; padding:3px 10px; border-radius:12px;
      font-size:12px; font-weight:600; text-transform:capitalize;
    }
    .badge-activo    { background:#F0FFF4; color:#16A34A; }
    .badge-atrasado  { background:#FFFBEB; color:#D97706; }
    .badge-vencido   { background:#FEF2F2; color:#DC2626; }
    .row-rojo    { background:#FFF5F5 !important; }
    .row-amarillo{ background:#FFFEF5 !important; }
    .loading-overlay { display:flex; justify-content:center; padding:40px; }
    .empty-state { text-align:center; padding:40px; color:#718096; }
    .empty-state mat-icon { font-size:48px; width:48px; height:48px; color:#16A34A; }

    @media (max-width: 599px) {
      .mat-column-saldo, .mat-column-monto, .mat-column-cuota { display: none; }
    }
  `],
})
export class MonitorComponent implements OnInit {
  private gestor = inject(GestorService);
  private router = inject(Router);

  cols = ['nivel', 'cliente', 'atrasos', 'monto', 'cuota', 'saldo', 'estatus', 'acciones'];
  loading = signal(true);
  creditos = signal<CreditoSemaforo[]>([]);
  resumen = signal<MonitorResumen>({ verde: 0, amarillo: 0, rojo: 0, total: 0 });
  filtro = signal<NivelSemaforo | null>(null);
  search = signal('');

  private searchSubject = new Subject<string>();

  // La vista es fija en rojo; creditos() ya viene filtrado a ROJO desde cargar().
  creditosFiltrados = computed(() => this.creditos());

  ngOnInit() {
    // Búsqueda con debounce (como el frontend): busca al escribir, sin Enter.
    this.searchSubject
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => this.cargar());
    this.cargar();
  }

  onSearch(ev: Event) {
    const val = (ev.target as HTMLInputElement).value;
    this.search.set(val);
    this.searchSubject.next(val);
  }

  cargar() {
    this.loading.set(true);
    // El monitor del gestor muestra ÚNICAMENTE la cartera en rojo (créditos
    // críticos, >5 atrasos / vencidos). Se pide directamente ese nivel al
    // backend para no traer verdes/amarillos.
    this.gestor.getMonitor({ nivel: 'ROJO', search: this.search() || undefined }).subscribe({
      next: (res) => {
        // Respaldo: por si el backend devolviera otros niveles, se filtra aquí.
        this.creditos.set((res.creditos || []).filter((c) => c.nivel === 'ROJO'));
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
    this.router.navigate(['/credito', c.loanId], { state: { credito: c } });
  }

  nivelLabel(n: NivelSemaforo) {
    return { VERDE: 'Al corriente', AMARILLO: 'En riesgo', ROJO: 'Crítico' }[n];
  }
}