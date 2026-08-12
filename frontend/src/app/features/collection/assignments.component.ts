import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../core/index';
import { forkJoin } from 'rxjs';

/**
 * Fecha de HOY en la zona de México (America/Mexico_City), formato YYYY-MM-DD.
 * Evita el bug de new Date().toISOString() que usa UTC y, por la tarde/noche
 * en México (UTC-6), devuelve el día siguiente.
 */
function hoyMexico(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

@Component({
  selector: 'app-assignments',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule,
    FormsModule, MatTableModule, MatCheckboxModule, MatChipsModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>assignment</mat-icon> Asignación de cobradores</h1>
      <a mat-stroked-button routerLink="/collection">
        <mat-icon>arrow_back</mat-icon> Cobranza
      </a>
    </div>

    <div class="assign-layout">

      <!-- Panel izquierdo: selección de cobrador y fecha -->
      <mat-card>
        <mat-card-header><mat-card-title>Configurar asignación</mat-card-title></mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" class="assign-form">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Cobrador *</mat-label>
              <mat-select formControlName="collectorId">
                @for (c of collectors(); track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Fecha de visita *</mat-label>
              <input matInput type="date" formControlName="date">
            </mat-form-field>
          </form>

          @if (selectedLoans().length > 0) {
            <div class="alert-box success">
              <mat-icon>check_circle</mat-icon>
              <span>{{ selectedLoans().length }} crédito(s) seleccionado(s)</span>
            </div>
          }

          <div class="form-actions" style="margin-top:16px">
            <button mat-raised-button color="primary"
                    [disabled]="form.invalid || selectedLoans().length === 0 || saving()"
                    (click)="assign()">
              @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { <mat-icon>save</mat-icon> }
              Guardar asignación
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Panel derecho: lista de créditos para seleccionar -->
      <mat-card>
        <mat-card-header>
          <mat-card-title>Créditos disponibles</mat-card-title>
          <mat-card-subtitle>Selecciona los créditos a asignar</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <!-- Filtros: estado de asignación y búsqueda por cliente -->
          <div class="filtros-bar">
            <mat-form-field appearance="outline" class="f-asignacion">
              <mat-label>Mostrar</mat-label>
              <mat-select [value]="filtroAsignacion()" (selectionChange)="onFiltroAsignacion($event.value)">
                <mat-option value="todos">Todos</mat-option>
                <mat-option value="sin_asignar">Sin asignar</mat-option>
                <mat-option value="asignados">Asignados</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="f-cliente">
              <mat-label>Buscar cliente</mat-label>
              <input matInput [value]="filtroCliente()" (input)="onFiltroCliente($event)"
                     placeholder="Nombre o teléfono">
              <mat-icon matPrefix>search</mat-icon>
            </mat-form-field>
          </div>

          @if (loading()) {
            <div class="loading-overlay"><mat-spinner diameter="36"></mat-spinner></div>
          } @else if (loans().length === 0) {
            <div class="empty-state">
              <mat-icon>check_circle</mat-icon>
             <p>Sin créditos vencidos, atrasados o activos disponibles</p>
            </div>
          } @else {
            <table mat-table [dataSource]="loans()">
              <ng-container matColumnDef="select">
                <th mat-header-cell *matHeaderCellDef style="width:48px">
                  <input type="checkbox"
                         [checked]="allSelected()"
                         (change)="toggleAll($any($event.target).checked)"
                         style="width:16px;height:16px;cursor:pointer;accent-color:#1C4532">
                </th>
                <td mat-cell *matCellDef="let r" style="width:48px">
                  <input type="checkbox"
                         [checked]="isSelected(r.id)"
                         (change)="toggleLoan(r.id)"
                         (click)="$event.stopPropagation()"
                         style="width:16px;height:16px;cursor:pointer;accent-color:#1C4532">
                </td>
              </ng-container>

              <ng-container matColumnDef="cliente">
                <th mat-header-cell *matHeaderCellDef>Cliente</th>
                <td mat-cell *matCellDef="let r">
                  <div class="client-name">{{ r.customer?.fullName }}</div>
                  <div class="client-sub">{{ r.customer?.phone }}</div>
                </td>
              </ng-container>

              <ng-container matColumnDef="monto">
                <th mat-header-cell *matHeaderCellDef>Cuota</th>
                <td mat-cell *matCellDef="let r">
                  <strong>\${{ r.periodicPayment | number:'1.2-2' }}</strong>
                </td>
              </ng-container>

              <ng-container matColumnDef="estatus">
                <th mat-header-cell *matHeaderCellDef>Estatus</th>
                <td mat-cell *matCellDef="let r">
                  <span class="badge badge-{{ r.status | lowercase }}">{{ r.status }}</span>
                </td>
              </ng-container>

              <ng-container matColumnDef="cobrador">
                <th mat-header-cell *matHeaderCellDef>Cobrador actual</th>
                <td mat-cell *matCellDef="let r" style="font-size:12px">
                  @if (r.collectorId) {
                    <span class="asignado-a">{{ r.collectorName || 'Asignado' }}</span>
                  } @else {
                    <span style="color:#A0AEC0">Sin asignar</span>
                  }
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="cols"></tr>
              <tr mat-row *matRowDef="let row; columns: cols;"
                  [class.selected-row]="isSelected(row.id)"
                  (click)="toggleLoan(row.id)"
                  style="cursor:pointer">
              </tr>
            </table>
          }
        </mat-card-content>
      </mat-card>

    </div>
  `,
  styles: [`
    .assign-layout { display:grid; grid-template-columns:320px 1fr; gap:16px; align-items:start; }
    .assign-form { display:flex; flex-direction:column; gap:12px; }
    .selected-row { background:rgba(28,69,50,.06) !important; }
    .filtros-bar { display:flex; gap:12px; margin-bottom:8px; flex-wrap:wrap; }
    .filtros-bar .f-asignacion { width:170px; }
    .filtros-bar .f-cliente { flex:1; min-width:200px; }
    .asignado-a {
      display:inline-block; padding:2px 8px; border-radius:10px;
      background:#EBF8FF; color:#2B6CB0; font-weight:600; font-size:12px;
    }
    @media(max-width:800px){ .assign-layout { grid-template-columns:1fr; } }
  `],
})
export class AssignmentsComponent implements OnInit {
  private api      = inject(ApiService);
  private fb       = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  collectors   = signal<any[]>([]);
  loans        = signal<any[]>([]);
  selectedIds  = signal<Set<string>>(new Set());
  loading      = signal(true);
  saving       = signal(false);
  // Filtros de la lista de créditos.
  filtroAsignacion = signal<'todos' | 'sin_asignar' | 'asignados'>('todos');
  filtroCliente    = signal('');
  private buscarTimer: any = null;

  cols = ['select', 'cliente', 'monto', 'estatus', 'cobrador'];

  form = this.fb.group({
    collectorId: ['', Validators.required],
    date: [hoyMexico(), Validators.required],
  });

  selectedLoans = () => Array.from(this.selectedIds());
  allSelected   = () => this.loans().length > 0 && this.selectedIds().size === this.loans().length;
  someSelected  = () => this.selectedIds().size > 0 && this.selectedIds().size < this.loans().length;
  isSelected    = (id: string) => this.selectedIds().has(id);

  ngOnInit() {
    // Cargar cobradores
    this.api.get<any>('/users/collectors').subscribe({
      next: (r) => {
        let list: any[] = [];
        if (Array.isArray(r))            list = r;
        else if (Array.isArray(r?.data)) list = r.data;
        else if (Array.isArray(r?.data?.data)) list = r.data.data;
        this.collectors.set(list);
      },
      error: (e) => console.error('Error cargando cobradores:', e),
    });

    this.cargarCreditos();
  }

  // Carga los créditos aplicando los filtros de asignación y cliente.
  cargarCreditos() {
    const extractList = (r: any): any[] => {
      if (Array.isArray(r)) return r;
      if (Array.isArray(r?.data)) return r.data;
      if (Array.isArray(r?.data?.data)) return r.data.data;
      return [];
    };

    this.loading.set(true);

    // Parámetros comunes de filtro (asignación y búsqueda de cliente).
    const asignacion = this.filtroAsignacion();
    const search = this.filtroCliente().trim();
    const baseParams: any = { limit: 100 };
    if (asignacion !== 'todos') baseParams.asignacion = asignacion;
    if (search) baseParams.search = search;

    forkJoin({
      activos:   this.api.get<any>('/loans', { ...baseParams, status: 'ACTIVO' }),
      atrasados: this.api.get<any>('/loans', { ...baseParams, status: 'ATRASADO' }),
      vencidos:  this.api.get<any>('/loans', { ...baseParams, status: 'VENCIDO' }),
    }).subscribe({
      next: ({ activos, atrasados, vencidos }) => {
        this.loans.set([
          ...extractList(vencidos),
          ...extractList(atrasados),
          ...extractList(activos),
        ]);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error cargando créditos disponibles:', err);
        this.loans.set([]);
        this.loading.set(false);
      },
    });
  }

  onFiltroAsignacion(val: 'todos' | 'sin_asignar' | 'asignados') {
    this.filtroAsignacion.set(val);
    this.selectedIds.set(new Set()); // limpiar selección al cambiar filtro
    this.cargarCreditos();
  }

  onFiltroCliente(ev: Event) {
    this.filtroCliente.set((ev.target as HTMLInputElement).value || '');
    // Debounce para no consultar en cada tecla.
    clearTimeout(this.buscarTimer);
    this.buscarTimer = setTimeout(() => this.cargarCreditos(), 350);
  }

  toggleLoan(id: string) {
    const set = new Set(this.selectedIds());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.selectedIds.set(set);
  }

  toggleAll(checked: boolean) {
    if (checked) {
      this.selectedIds.set(new Set(this.loans().map(l => l.id)));
    } else {
      this.selectedIds.set(new Set());
    }
  }

  assign() {
    if (this.form.invalid || this.selectedLoans().length === 0) return;
    this.saving.set(true);
    this.api.post('/collection/assignments', {
      collectorId: this.form.value.collectorId,
      date:        this.form.value.date,
      loanIds:     this.selectedLoans(),
    }).subscribe({
      next: () => {
        this.snackbar.open(
          `${this.selectedLoans().length} crédito(s) asignado(s) correctamente`,
          'OK', { duration: 4000 }
        );
        this.selectedIds.set(new Set());
        this.saving.set(false);
        this.cargarCreditos(); // refrescar para ver el nuevo cobrador asignado
      },
      error: (err: any) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error al asignar', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }
}