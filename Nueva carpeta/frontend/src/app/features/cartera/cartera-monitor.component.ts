import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-cartera-monitor',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatButtonToggleModule, MatIconModule, MatTableModule,
    MatProgressSpinnerModule, MatChipsModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>monitor_heart</mat-icon> Monitor de cartera</h1>
      <button mat-stroked-button (click)="load()">
        <mat-icon>refresh</mat-icon> Actualizar
      </button>
    </div>

    <!-- Semáforo resumen -->
    <div class="semaforo-grid">
      <div class="sem-card sem-verde" [class.active]="filtroNivel() === 'VERDE'"
           (click)="toggleFiltro('VERDE')">
        <div class="sem-dot"></div>
        <div class="sem-info">
          <span class="sem-num">{{ summary()?.verde ?? 0 }}</span>
          <span class="sem-label">Al corriente</span>
        </div>
      </div>
      <div class="sem-card sem-amarillo" [class.active]="filtroNivel() === 'AMARILLO'"
           (click)="toggleFiltro('AMARILLO')">
        <div class="sem-dot"></div>
        <div class="sem-info">
          <span class="sem-num">{{ summary()?.amarillo ?? 0 }}</span>
          <span class="sem-label">1-{{ config()?.yellowUpTo ?? 5 }} atrasos</span>
        </div>
      </div>
      <div class="sem-card sem-rojo" [class.active]="filtroNivel() === 'ROJO'"
           (click)="toggleFiltro('ROJO')">
        <div class="sem-dot"></div>
        <div class="sem-info">
          <span class="sem-num">{{ summary()?.rojo ?? 0 }}</span>
          <span class="sem-label">Más de {{ config()?.yellowUpTo ?? 5 }} atrasos</span>
        </div>
      </div>
      <div class="sem-card sem-total">
        <div class="sem-info">
          <span class="sem-num">{{ summary()?.total ?? 0 }}</span>
          <span class="sem-label">Total créditos</span>
        </div>
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

        @if (filtroNivel()) {
          <button mat-button color="primary" (click)="toggleFiltro(filtroNivel()!)">
            <mat-icon>clear</mat-icon> Quitar filtro {{ filtroNivel() }}
          </button>
        }

        @if (loading()) {
          <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
        } @else if (rows().length === 0) {
          <div class="empty-state">
            <mat-icon>check_circle</mat-icon>
            <p>No hay créditos {{ filtroNivel() ? 'en este nivel' : '' }}.</p>
          </div>
        } @else {
          <table mat-table [dataSource]="rows()" class="w-full">
            <ng-container matColumnDef="nivel">
              <th mat-header-cell *matHeaderCellDef>Semáforo</th>
              <td mat-cell *matCellDef="let r">
                <span class="nivel-dot nivel-{{ r.level | lowercase }}"
                      [title]="r.level"></span>
              </td>
            </ng-container>
            <ng-container matColumnDef="cliente">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let r">
                <div class="cli-name">{{ r.customerName }}</div>
                <div class="cli-phone">{{ r.customerPhone }}</div>
              </td>
            </ng-container>
            <ng-container matColumnDef="atrasos">
              <th mat-header-cell *matHeaderCellDef>Cuotas vencidas</th>
              <td mat-cell *matCellDef="let r">
                <span class="atraso-badge atraso-{{ r.level | lowercase }}">{{ r.overdueCount }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="monto">
              <th mat-header-cell *matHeaderCellDef>Monto</th>
              <td mat-cell *matCellDef="let r">{{ r.principalAmount | currency:'MXN' }}</td>
            </ng-container>
            <ng-container matColumnDef="cuota">
              <th mat-header-cell *matHeaderCellDef>Cuota</th>
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
                [class.row-rojo]="row.level === 'ROJO'"
                [class.row-amarillo]="row.level === 'AMARILLO'"></tr>
          </table>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
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
    .row-rojo    { background:#FFF5F5 !important; }
    .row-amarillo{ background:#FFFEF5 !important; }
    .loading-overlay { display:flex; justify-content:center; padding:40px; }
    .empty-state { text-align:center; padding:40px; color:#718096; }
    .empty-state mat-icon { font-size:48px; width:48px; height:48px; color:#16A34A; }
  `],
})
export class CarteraMonitorComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  rows       = signal<any[]>([]);
  summary    = signal<any>(null);
  config     = signal<any>(null);
  loading    = signal(true);
  search     = signal('');
  filtroNivel = signal<string | null>(null);

  cols = ['nivel', 'cliente', 'atrasos', 'monto', 'cuota', 'estatus', 'acciones'];

  private searchSubject = new Subject<string>();

  ngOnInit() {
    this.searchSubject.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.load());
    this.load();
  }

  load() {
    this.loading.set(true);
    const params: any = {};
    if (this.filtroNivel()) params.nivel = this.filtroNivel();
    if (this.search()) params.search = this.search();
    this.api.get<any>('/semaforo/monitor', params).subscribe({
      next: (r) => {
        this.rows.set(r?.data ?? []);
        this.summary.set(r?.summary ?? null);
        this.config.set(r?.config ?? null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSearch(event: Event) {
    this.search.set((event.target as HTMLInputElement).value);
    this.searchSubject.next(this.search());
  }

  toggleFiltro(nivel: string) {
    this.filtroNivel.set(this.filtroNivel() === nivel ? null : nivel);
    this.load();
  }

  verCredito(id: string) {
    this.router.navigate(['/loans', id]);
  }
}