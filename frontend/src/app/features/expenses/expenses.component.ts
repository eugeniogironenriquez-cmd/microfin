import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/index';
import { PdfDownloadService } from '../../core/pdf-download.service';

/**
 * Fecha de HOY en la zona de México (America/Mexico_City), formato YYYY-MM-DD.
 * Evita el bug de new Date().toISOString() que usa UTC y, por la tarde/noche
 * en México (UTC-6), devuelve el día siguiente.
 */
function hoyMexico(): string {
  // 'en-CA' produce el formato YYYY-MM-DD directamente.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Primer día del mes actual en zona de México, formato YYYY-MM-DD. */
function inicioMesMexico(): string {
  return hoyMexico().substring(0, 7) + '-01';
}

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatTableModule, MatTabsModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatPaginatorModule, MatDividerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>receipt_long</mat-icon> Gastos operativos</h1>
    </div>

    <mat-tab-group>

      <!-- TAB 1: REGISTRAR GASTO -->
      <mat-tab label="Registrar gasto">
        <div class="tab-content">
          <div class="expense-layout">
            <mat-card>
              <mat-card-header><mat-card-title>Nuevo gasto</mat-card-title></mat-card-header>
              <mat-card-content>
                <form [formGroup]="form" (ngSubmit)="save()" class="expense-form">

                  <mat-form-field appearance="outline">
                    <mat-label>Categoría *</mat-label>
                    <mat-select formControlName="categoryId">
                      @for (c of categories(); track c.id) {
                        <mat-option [value]="c.id">{{ c.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Monto *</mat-label>
                    <input matInput type="number" step="0.01" formControlName="amount">
                    <span matPrefix>&nbsp;$&nbsp;</span>
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Fecha *</mat-label>
                    <input matInput type="date" formControlName="expenseDate">
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Forma de pago</mat-label>
                    <mat-select formControlName="method">
                      <mat-option value="EFECTIVO">Efectivo</mat-option>
                      <mat-option value="TRANSFERENCIA">Transferencia</mat-option>
                      <mat-option value="TARJETA">Tarjeta</mat-option>
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Descripción *</mat-label>
                    <textarea matInput formControlName="description" rows="3"
                      placeholder="Describe el gasto..."></textarea>
                  </mat-form-field>

                  <div class="alert-box info">
                    <mat-icon>info</mat-icon>
                    <span>El gasto se registrará como salida en la sesión de caja activa.</span>
                  </div>

                  <button mat-raised-button color="primary" type="submit"
                          [disabled]="form.invalid || saving()">
                    @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                    @else { <mat-icon>save</mat-icon> }
                    Registrar gasto
                  </button>
                </form>
              </mat-card-content>
            </mat-card>

            <!-- Lista reciente -->
            <mat-card>
              <mat-card-header><mat-card-title>Gastos registrados</mat-card-title></mat-card-header>
              <mat-card-content>
                <!-- Filtro por rango de fechas: permite consultar cualquier fecha -->
                <div class="date-filters" style="margin-bottom:16px">
                  <mat-form-field appearance="outline">
                    <mat-label>Desde</mat-label>
                    <input matInput type="date" [formControl]="listStartCtrl">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Hasta</mat-label>
                    <input matInput type="date" [formControl]="listEndCtrl">
                  </mat-form-field>
                  <button mat-stroked-button color="primary" (click)="aplicarFiltroLista()">
                    <mat-icon>search</mat-icon> Filtrar
                  </button>
                  <button mat-button (click)="limpiarFiltroLista()">
                    <mat-icon>clear</mat-icon> Limpiar
                  </button>
                  <button mat-stroked-button color="accent" (click)="exportarExcel()">
                    <mat-icon>download</mat-icon> Exportar Excel
                  </button>
                </div>

                @if (loading()) {
                  <div class="loading-overlay"><mat-spinner diameter="36"></mat-spinner></div>
                } @else if (expenses().length === 0) {
                  <div class="empty-state">
                    <mat-icon>receipt_long</mat-icon>
                    <p>Sin gastos en el periodo seleccionado</p>
                  </div>
                } @else {
                  <table mat-table [dataSource]="expenses()">
                    <ng-container matColumnDef="fecha">
                      <th mat-header-cell *matHeaderCellDef>Fecha</th>
                      <td mat-cell *matCellDef="let r">{{ r.expenseDate | date:'dd/MM/yyyy' }}</td>
                    </ng-container>
                    <ng-container matColumnDef="categoria">
                      <th mat-header-cell *matHeaderCellDef>Categoría</th>
                      <td mat-cell *matCellDef="let r">{{ r.category?.name || '—' }}</td>
                    </ng-container>
                    <ng-container matColumnDef="descripcion">
                      <th mat-header-cell *matHeaderCellDef>Descripción</th>
                      <td mat-cell *matCellDef="let r">{{ r.description }}</td>
                    </ng-container>
                    <ng-container matColumnDef="monto">
                      <th mat-header-cell *matHeaderCellDef>Monto</th>
                      <td mat-cell *matCellDef="let r">
                        <strong style="color:#DC2626">{{ r.amount | currency:'MXN' }}</strong>
                      </td>
                    </ng-container>
                    <tr mat-header-row *matHeaderRowDef="expCols"></tr>
                    <tr mat-row *matRowDef="let row; columns: expCols;"></tr>
                  </table>
                  <mat-paginator [length]="total()" [pageSize]="10" (page)="onPage($event)"></mat-paginator>
                }
              </mat-card-content>
            </mat-card>
          </div>
        </div>
      </mat-tab>

      <!-- TAB 2: REPORTE -->
      <mat-tab label="Reporte ingresos vs gastos">
        <div class="tab-content">
          <mat-card class="filters-card">
            <div class="date-filters">
              <mat-form-field appearance="outline">
                <mat-label>Desde</mat-label>
                <input matInput type="date" [formControl]="reportStartCtrl">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Hasta</mat-label>
                <input matInput type="date" [formControl]="reportEndCtrl">
              </mat-form-field>
              <button mat-raised-button color="primary" (click)="loadReport()" [disabled]="loadingReport()">
                <mat-icon>search</mat-icon> Generar
              </button>
            </div>
          </mat-card>

          @if (loadingReport()) {
            <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
          } @else if (report()) {
            <div class="report-grid">
              <mat-card class="income-card">
                <mat-card-header><mat-card-title>Ingresos</mat-card-title></mat-card-header>
                <mat-card-content>
                  <div class="report-big">{{ report()!.ingresos.total | currency:'MXN' }}</div>
                  <mat-divider style="margin:12px 0"></mat-divider>
                  <div class="report-row"><span>Capital</span><strong>{{ report()!.ingresos.capital | currency:'MXN' }}</strong></div>
                  <div class="report-row"><span>Intereses</span><strong>{{ report()!.ingresos.intereses | currency:'MXN' }}</strong></div>
                  <div class="report-row"><span>Moratorios</span><strong>{{ report()!.ingresos.moratorios | currency:'MXN' }}</strong></div>
                  <div class="report-row"><span>Pagos registrados</span><strong>{{ report()!.ingresos.numPagos }}</strong></div>
                </mat-card-content>
              </mat-card>

              <mat-card class="expense-card">
                <mat-card-header><mat-card-title>Gastos</mat-card-title></mat-card-header>
                <mat-card-content>
                  <div class="report-big danger">{{ report()!.gastos.total | currency:'MXN' }}</div>
                  <mat-divider style="margin:12px 0"></mat-divider>
                  @for (cat of report()!.gastos.porCategoria; track cat.categoria) {
                    <div class="report-row">
                      <span>{{ cat.categoria }}</span>
                      <strong>{{ cat.subtotal | currency:'MXN' }}</strong>
                    </div>
                  }
                </mat-card-content>
              </mat-card>

              <mat-card [class.income-card]="report()!.utilidad >= 0" [class.expense-card]="report()!.utilidad < 0">
                <mat-card-header><mat-card-title>Utilidad neta</mat-card-title></mat-card-header>
                <mat-card-content>
                  <div class="report-big" [style.color]="report()!.utilidad >= 0 ? '#16A34A' : '#DC2626'">
                    {{ report()!.utilidad | currency:'MXN' }}
                  </div>
                  <p style="color:rgba(0,0,0,.5);font-size:13px;margin-top:8px">
                    {{ reportStartCtrl.value }} — {{ reportEndCtrl.value }}
                  </p>
                </mat-card-content>
              </mat-card>
            </div>
          }
        </div>
      </mat-tab>

      <!-- TAB 3: CATEGORÍAS -->
      <mat-tab label="Categorías">
        <div class="tab-content">
          <mat-card>
            <mat-card-content>
              <div class="cat-layout">
                <form [formGroup]="catForm" (ngSubmit)="saveCategory()" class="cat-form">
                  <mat-form-field appearance="outline">
                    <mat-label>Nombre *</mat-label>
                    <input matInput formControlName="name">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Descripción</mat-label>
                    <input matInput formControlName="description">
                  </mat-form-field>
                  <button mat-raised-button color="primary" type="submit" [disabled]="catForm.invalid">
                    <mat-icon>add</mat-icon> Agregar categoría
                  </button>
                </form>

                <table mat-table [dataSource]="categories()">
                  <ng-container matColumnDef="nombre">
                    <th mat-header-cell *matHeaderCellDef>Nombre</th>
                    <td mat-cell *matCellDef="let c">{{ c.name }}</td>
                  </ng-container>
                  <ng-container matColumnDef="desc">
                    <th mat-header-cell *matHeaderCellDef>Descripción</th>
                    <td mat-cell *matCellDef="let c" style="color:rgba(0,0,0,.5)">{{ c.description || '—' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="acciones">
                    <th mat-header-cell *matHeaderCellDef></th>
                    <td mat-cell *matCellDef="let c">
                      <button mat-icon-button color="warn" (click)="removeCategory(c.id)">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="catCols"></tr>
                  <tr mat-row *matRowDef="let row; columns: catCols;"></tr>
                </table>
              </div>
            </mat-card-content>
          </mat-card>
        </div>
      </mat-tab>

    </mat-tab-group>
  `,
})
export class ExpensesComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);
  private pdfSvc = inject(PdfDownloadService);

  categories = signal<any[]>([]);
  expenses   = signal<any[]>([]);
  total      = signal(0);
  loading    = signal(true);
  saving     = signal(false);
  loadingReport = signal(false);
  report     = signal<any>(null);

  // FormControls para las fechas del reporte (reemplaza ngModel)
  reportStartCtrl = new FormControl(
    inicioMesMexico()
  );
  reportEndCtrl = new FormControl(
    hoyMexico()
  );

  // FormControls para filtrar la LISTA de gastos por rango de fechas.
  // Vacíos por defecto: muestra los gastos más recientes (sin filtro).
  listStartCtrl = new FormControl('');
  listEndCtrl = new FormControl('');

  expCols = ['fecha', 'categoria', 'descripcion', 'monto'];
  catCols = ['nombre', 'desc', 'acciones'];
  page = 0;

  form = this.fb.group({
    categoryId:  ['', Validators.required],
    amount:      [null as number | null, [Validators.required, Validators.min(0.01)]],
    expenseDate: [hoyMexico(), Validators.required],
    method:      ['EFECTIVO'],
    description: ['', Validators.required],
  });

  catForm = this.fb.group({
    name:        ['', Validators.required],
    description: [''],
  });

  ngOnInit() {
    this.loadCategories();
    this.loadExpenses();
  }

  loadCategories() {
    this.api.get<any[]>('/expense-categories').subscribe({
      next: (c) => this.categories.set(c),
    });
  }

  loadExpenses() {
    this.loading.set(true);
    const params: any = { page: this.page + 1, limit: 10 };
    // Aplicar filtro de fechas si el usuario lo definió.
    const desde = this.listStartCtrl.value;
    const hasta = this.listEndCtrl.value;
    if (desde) params.startDate = desde;
    if (hasta) params.endDate = hasta;
    this.api.get<any>('/expenses', params).subscribe({
      next: (r) => { this.expenses.set(r.data); this.total.set(r.total); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  // Aplica el filtro de fechas a la lista (vuelve a la primera página).
  aplicarFiltroLista() {
    this.page = 0;
    this.loadExpenses();
  }

  // Limpia el filtro de fechas y recarga los gastos más recientes.
  limpiarFiltroLista() {
    this.listStartCtrl.setValue('');
    this.listEndCtrl.setValue('');
    this.page = 0;
    this.loadExpenses();
  }

  // Exporta a Excel los gastos con el filtro de fechas aplicado actualmente.
  exportarExcel() {
    const params = new URLSearchParams();
    const desde = this.listStartCtrl.value;
    const hasta = this.listEndCtrl.value;
    if (desde) params.set('startDate', desde);
    if (hasta) params.set('endDate', hasta);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const sufijo = desde || hasta ? `-${desde || 'inicio'}-a-${hasta || 'hoy'}` : '';
    this.pdfSvc.download(`/expenses/export/excel${qs}`, `gastos${sufijo}.xlsx`);
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.post('/expenses', this.form.value).subscribe({
      next: () => {
        this.snackbar.open('Gasto registrado', 'OK', { duration: 3000 });
        this.saving.set(false);
        this.form.patchValue({ amount: null, description: '' });
        this.loadExpenses();
      },
      error: (err: any) => {
        this.snackbar.open(err.error?.message || 'Error al registrar', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  loadReport() {
    this.loadingReport.set(true);
    this.api.get<any>('/expenses/report/income-expense', {
      startDate: this.reportStartCtrl.value,
      endDate:   this.reportEndCtrl.value,
    }).subscribe({
      next: (r) => { this.report.set(r); this.loadingReport.set(false); },
      error: () => this.loadingReport.set(false),
    });
  }

  saveCategory() {
    if (this.catForm.invalid) return;
    this.api.post('/expense-categories', this.catForm.value).subscribe({
      next: () => {
        this.snackbar.open('Categoría creada', 'OK', { duration: 2000 });
        this.catForm.reset();
        this.loadCategories();
      },
    });
  }

  removeCategory(id: string) {
    this.api.delete('/expense-categories/' + id).subscribe({
      next: () => { this.snackbar.open('Eliminada', 'OK', { duration: 2000 }); this.loadCategories(); },
    });
  }

  onPage(e: PageEvent) { this.page = e.pageIndex; this.loadExpenses(); }
}