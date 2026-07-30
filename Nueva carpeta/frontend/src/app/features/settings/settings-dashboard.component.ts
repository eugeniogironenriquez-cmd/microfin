import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService, LoanType } from '../../core/index';

function unidadPlazo(freq: string): string {
  const map: Record<string, string> = {
    DIARIO: 'días', SEMANAL: 'semanas', QUINCENAL: 'quincenas', MENSUAL: 'meses',
  };
  return map[freq] ?? 'períodos';
}

@Component({
  selector: 'app-settings-dashboard',
  standalone: true,
  imports: [
    CommonModule, DecimalPipe, ReactiveFormsModule,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatSlideToggleModule, MatTooltipModule,
    MatTabsModule, MatChipsModule, MatDividerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>settings</mat-icon> Configuración</h1>
    </div>

    <mat-tab-group>

      <!-- ── TAB 1: TIPOS DE PRÉSTAMO ─────────────────────── -->
      <mat-tab label="Tipos de préstamo">
        <div class="tab-content">
          <mat-card>
            <mat-card-header>
              <mat-card-title>Tipos de préstamo</mat-card-title>
              <div class="spacer"></div>
              <button mat-stroked-button color="primary" (click)="showTypeForm.set(!showTypeForm())">
                <mat-icon>{{ showTypeForm() ? 'close' : 'add' }}</mat-icon>
                {{ showTypeForm() ? 'Cancelar' : 'Nuevo tipo' }}
              </button>
            </mat-card-header>

            @if (showTypeForm()) {
              <mat-card class="inner-form-card">
                <mat-card-content>
                  <form [formGroup]="typeForm" (ngSubmit)="saveType()" class="type-form">
                    <mat-form-field appearance="outline" class="col-span-2">
                      <mat-label>Nombre *</mat-label>
                      <input matInput formControlName="name" placeholder="Ej: Crédito Diario">
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Monto mínimo *</mat-label>
                      <input matInput type="number" formControlName="minAmount">
                      <span matPrefix>$&nbsp;</span>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Monto máximo *</mat-label>
                      <input matInput type="number" formControlName="maxAmount">
                      <span matPrefix>$&nbsp;</span>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Frecuencia *</mat-label>
                      <mat-select formControlName="frequency" (selectionChange)="onFrequencyChange()">
                        <mat-option value="DIARIO">Diario</mat-option>
                        <mat-option value="SEMANAL">Semanal</mat-option>
                        <mat-option value="QUINCENAL">Quincenal</mat-option>
                        <mat-option value="MENSUAL">Mensual</mat-option>
                      </mat-select>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Moratorio por día de atraso</mat-label>
                      <input matInput type="number" step="1" formControlName="lateFeeFixedAmount">
                      <span matPrefix>$&nbsp;</span>
                      <mat-hint>Ej: $50 por día vencido</mat-hint>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Días de gracia</mat-label>
                      <input matInput type="number" formControlName="graceDays">
                    </mat-form-field>

                    <div class="form-actions col-span-2">
                      <button mat-raised-button color="primary" type="submit"
                              [disabled]="typeForm.invalid || savingType()">
                        @if (savingType()) { <mat-spinner diameter="18"></mat-spinner> }
                        @else { <mat-icon>save</mat-icon> }
                        Guardar tipo
                      </button>
                    </div>
                  </form>
                </mat-card-content>
              </mat-card>
            }

            <mat-card-content>
              @if (loading()) {
                <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
              } @else {
                <table mat-table [dataSource]="loanTypes()">
                  <ng-container matColumnDef="name">
                    <th mat-header-cell *matHeaderCellDef>Nombre</th>
                    <td mat-cell *matCellDef="let r"><strong>{{ r.name }}</strong></td>
                  </ng-container>
                  <ng-container matColumnDef="amounts">
                    <th mat-header-cell *matHeaderCellDef>Monto</th>
                    <td mat-cell *matCellDef="let r">
                      {{ r.minAmount | number }} – {{ r.maxAmount | number }}
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="freq">
                    <th mat-header-cell *matHeaderCellDef>Frecuencia</th>
                    <td mat-cell *matCellDef="let r">{{ r.frequency }}</td>
                  </ng-container>
                  <ng-container matColumnDef="moratorio">
                    <th mat-header-cell *matHeaderCellDef>Moratorio/día</th>
                    <td mat-cell *matCellDef="let r">
                      {{ r.lateFeeFixedAmount ? ('$' + r.lateFeeFixedAmount) : '—' }}
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="active">
                    <th mat-header-cell *matHeaderCellDef>Activo</th>
                    <td mat-cell *matCellDef="let r">
                      <mat-slide-toggle [checked]="r.isActive"
                                        (change)="toggleActive(r)"></mat-slide-toggle>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="typeCols"></tr>
                  <tr mat-row *matRowDef="let row; columns: typeCols;"></tr>
                </table>
              }
            </mat-card-content>
          </mat-card>
        </div>
      </mat-tab>

      <!-- ── TAB 2: RANGOS DE TASA ────────────────────────── -->
      <mat-tab label="Rangos de tasa e interés">
        <div class="tab-content">
          <div class="alert-box info" style="margin-bottom:16px">
            <mat-icon>info</mat-icon>
            <span>
              Define para cada tipo de préstamo los rangos de monto, la tasa de interés total
              y los períodos disponibles. Ejemplo: $1,000–$3,000 al 30% en 20 o 30 días.
            </span>
          </div>

          <mat-card>
            <mat-card-header>
              <mat-card-title>Rangos de tasa configurados</mat-card-title>
              <div class="spacer"></div>
              <button mat-stroked-button color="primary" (click)="showRangeForm.set(!showRangeForm())">
                <mat-icon>{{ showRangeForm() ? 'close' : 'add' }}</mat-icon>
                {{ showRangeForm() ? 'Cancelar' : 'Nuevo rango' }}
              </button>
            </mat-card-header>

            @if (showRangeForm()) {
              <mat-card class="inner-form-card">
                <mat-card-content>
                  <form [formGroup]="rangeForm" (ngSubmit)="saveRange()" class="type-form">

                    <mat-form-field appearance="outline" class="col-span-2">
                      <mat-label>Tipo de préstamo *</mat-label>
                      <mat-select formControlName="loanTypeId">
                        @for (t of loanTypes(); track t.id) {
                          <mat-option [value]="t.id">{{ t.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Monto mínimo del rango *</mat-label>
                      <input matInput type="number" formControlName="minAmount">
                      <span matPrefix>$&nbsp;</span>
                      <mat-hint>Desde este monto aplica esta tasa</mat-hint>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Monto máximo del rango *</mat-label>
                      <input matInput type="number" formControlName="maxAmount">
                      <span matPrefix>$&nbsp;</span>
                      <mat-hint>Hasta este monto aplica esta tasa</mat-hint>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Tasa de interés total *</mat-label>
                      <input matInput type="number" step="0.01" formControlName="totalRate">
                      <span matSuffix>&nbsp;%</span>
                      <mat-hint>Ej: 29 = 29% sobre el capital. Total = monto × (1 + tasa)</mat-hint>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Períodos disponibles *</mat-label>
                      <input matInput formControlName="periodsInput"
                             placeholder="Ej: 20, 30, 45">
                      <mat-hint>Separados por coma. En días/semanas según frecuencia del tipo</mat-hint>
                    </mat-form-field>

                    <!-- Preview del cálculo -->
                    @if (rangePreview()) {
                      <div class="col-span-2">
                        <div class="range-preview">
                          <strong>Vista previa del cálculo</strong>
                          <div class="preview-grid">
                            @for (p of rangePreview()!.examples; track p.periods) {
                              <div class="preview-item">
                                <span class="preview-label">{{ p.periods }} períodos</span>
                                <span class="preview-cuota">Cuota: <strong>{{ p.cuota | currency:'MXN' }}</strong></span>
                                <span class="preview-total">Total: {{ p.total | currency:'MXN' }}</span>
                              </div>
                            }
                          </div>
                        </div>
                      </div>
                    }

                    <div class="form-actions col-span-2">
                      <button mat-raised-button color="primary" type="submit"
                              [disabled]="rangeForm.invalid || savingRange()">
                        @if (savingRange()) { <mat-spinner diameter="18"></mat-spinner> }
                        @else { <mat-icon>save</mat-icon> }
                        Guardar rango
                      </button>
                    </div>
                  </form>
                </mat-card-content>
              </mat-card>
            }

            <!-- Tabla de rangos -->
            <mat-card-content>
              @if (loadingRanges()) {
                <div class="loading-overlay"><mat-spinner diameter="36"></mat-spinner></div>
              } @else if (ranges().length === 0) {
                <div class="empty-state">
                  <mat-icon>tune</mat-icon>
                  <p>Sin rangos configurados. Agrega el primero.</p>
                </div>
              } @else {
                <table mat-table [dataSource]="ranges()">
                  <ng-container matColumnDef="tipo">
                    <th mat-header-cell *matHeaderCellDef>Tipo</th>
                    <td mat-cell *matCellDef="let r">{{ r.loanType?.name || '—' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="rango">
                    <th mat-header-cell *matHeaderCellDef>Rango de monto</th>
                    <td mat-cell *matCellDef="let r">
                      {{ r.minAmount | number }} – {{ r.maxAmount | number }}
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="tasa">
                    <th mat-header-cell *matHeaderCellDef>Tasa total</th>
                    <td mat-cell *matCellDef="let r">
                      <strong style="color:#1C4532">{{ (r.totalRate * 100).toFixed(0) }}%</strong>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="periodos">
                    <th mat-header-cell *matHeaderCellDef>Períodos disponibles</th>
                    <td mat-cell *matCellDef="let r">
                      @for (p of r.periods; track p) {
                        <span class="badge badge-solicitud" style="margin:2px">{{ p }}</span>
                      }
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="acciones">
                    <th mat-header-cell *matHeaderCellDef></th>
                    <td mat-cell *matCellDef="let r">
                      <button mat-icon-button color="warn" (click)="deleteRange(r.id)"
                              matTooltip="Eliminar rango">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="rangeCols"></tr>
                  <tr mat-row *matRowDef="let row; columns: rangeCols;"></tr>
                </table>
              }
            </mat-card-content>
          </mat-card>
        </div>
      </mat-tab>

    </mat-tab-group>
  `,
  styles: [`
    .settings-layout { display:flex; flex-direction:column; gap:16px; }
    .inner-form-card { margin:0 16px 16px; background:#FAFAFA; }
    .tab-content { padding: 16px 0; }
    .type-form { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px; }
    .col-span-2 { grid-column:1 / -1; }
    .spacer { flex:1; }
    @media(max-width:700px){ .type-form { grid-template-columns:1fr; } }

    .range-preview {
      background: #F0FFF4; border: 1px solid #BBF7D0;
      border-radius: 10px; padding: 14px 16px; margin-top: 8px;
    }
    .range-preview strong { font-size:13px; color:#1C4532; display:block; margin-bottom:10px; }
    .preview-grid { display:flex; gap:12px; flex-wrap:wrap; }
    .preview-item {
      background:#fff; border:1px solid #CBD5E0; border-radius:8px;
      padding:10px 14px; display:flex; flex-direction:column; gap:3px;
    }
    .preview-label { font-size:11px; color:#718096; text-transform:uppercase; letter-spacing:.4px; }
    .preview-cuota { font-size:15px; font-weight:600; color:#1C4532; }
    .preview-total { font-size:11px; color:#718096; }
  `],
})
export class SettingsDashboardComponent implements OnInit {
  private api      = inject(ApiService);
  private fb       = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  // Tipos de préstamo
  loanTypes     = signal<LoanType[]>([]);
  loading       = signal(true);
  showTypeForm  = signal(false);
  savingType    = signal(false);
  typeCols = ['name', 'amounts', 'freq', 'moratorio', 'active'];
  unidad = signal('días');

  // Rangos de tasa
  ranges        = signal<any[]>([]);
  loadingRanges = signal(true);
  showRangeForm = signal(false);
  savingRange   = signal(false);
  rangePreview  = signal<any>(null);
  rangeCols = ['tipo', 'rango', 'tasa', 'periodos', 'acciones'];

  typeForm = this.fb.group({
    name:               ['', Validators.required],
    minAmount:          [500,  Validators.required],
    maxAmount:          [50000, Validators.required],
    frequency:          ['DIARIO', Validators.required],
    lateFeeFixedAmount: [50],
    graceDays:          [0],
  });

  rangeForm = this.fb.group({
    loanTypeId:   ['', Validators.required],
    minAmount:    [null as number | null, Validators.required],
    maxAmount:    [null as number | null, Validators.required],
    totalRate:    [null as number | null, [Validators.required, Validators.min(0.01)]],
    periodsInput: ['', Validators.required],
  });

  ngOnInit() {
    this.load();
    this.loadRanges();
    // Preview en tiempo real
    this.rangeForm.valueChanges.subscribe(() => this.updatePreview());
  }

  load() {
    this.loading.set(true);
    this.api.get<LoanType[]>('/settings/loan-types').subscribe({
      next: (t) => { this.loanTypes.set(Array.isArray(t) ? t : (t as any)?.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadRanges() {
    this.loadingRanges.set(true);
    this.api.get<any[]>('/settings/rate-ranges').subscribe({
      next: (r) => { this.ranges.set(Array.isArray(r) ? r : (r as any)?.data ?? []); this.loadingRanges.set(false); },
      error: () => this.loadingRanges.set(false),
    });
  }

  onFrequencyChange() {
    const freq = this.typeForm.value.frequency || 'DIARIO';
    this.unidad.set(freq === 'DIARIO' ? 'días' : freq === 'SEMANAL' ? 'semanas' : freq === 'QUINCENAL' ? 'quincenas' : 'meses');
  }

  updatePreview() {
    const v = this.rangeForm.value;
    if (!v.minAmount || !v.totalRate || !v.periodsInput) { this.rangePreview.set(null); return; }
    const rate    = Number(v.totalRate) / 100;
    const monto   = Number(v.minAmount);
    const periods = (v.periodsInput || '').split(',').map((s: string) => Number(s.trim())).filter((n: number) => n > 0);
    if (!periods.length) { this.rangePreview.set(null); return; }
    const examples = periods.map((p: number) => ({
      periods:  p,
      total:    Math.round(monto * (1 + rate) * 100) / 100,
      cuota:    Math.round(monto * (1 + rate) / p * 100) / 100,
    }));
    this.rangePreview.set({ examples });
  }

  saveType() {
    if (this.typeForm.invalid) return;
    this.savingType.set(true);
    const v = this.typeForm.value;
    const payload = {
      name:               v.name,
      defaultRate:        0,
      minRate:            0,
      maxRate:            1,
      minAmount:          v.minAmount,
      maxAmount:          v.maxAmount,
      frequency:          v.frequency,
      minTermWeeks:       1,
      maxTermWeeks:       365,
      graceDays:          v.graceDays || 0,
      lateFeeFixedAmount: v.lateFeeFixedAmount || 0,
      lateFeeFactor: 1, lateFeeType: 'FIJO', lateFeeRate: null, lateFeeRateBasis: 'DIARIA',
    };
    this.api.post('/settings/loan-types', payload).subscribe({
      next: () => {
        this.snackbar.open('Tipo guardado', 'OK', { duration: 3000 });
        this.savingType.set(false); this.showTypeForm.set(false);
        this.typeForm.reset({ frequency: 'DIARIO', minAmount: 500, maxAmount: 50000, lateFeeFixedAmount: 50, graceDays: 0 });
        this.load();
      },
      error: (err: any) => { this.snackbar.open(err.error?.message?.[0] || 'Error', 'Cerrar', { duration: 5000 }); this.savingType.set(false); },
    });
  }

  saveRange() {
    if (this.rangeForm.invalid) return;
    this.savingRange.set(true);
    const v = this.rangeForm.value;
    const periods = (v.periodsInput || '').split(',').map((s: string) => Number(s.trim())).filter((n: number) => n > 0);
    const payload = {
      loanTypeId: v.loanTypeId,
      minAmount:  v.minAmount,
      maxAmount:  v.maxAmount,
      totalRate:  Number(v.totalRate) / 100,
      periods,
    };
    this.api.post('/settings/rate-ranges', payload).subscribe({
      next: () => {
        this.snackbar.open('Rango guardado', 'OK', { duration: 3000 });
        this.savingRange.set(false); this.showRangeForm.set(false);
        this.rangeForm.reset(); this.rangePreview.set(null);
        this.loadRanges();
      },
      error: (err: any) => { this.snackbar.open(err.error?.message?.[0] || 'Error', 'Cerrar', { duration: 5000 }); this.savingRange.set(false); },
    });
  }

  deleteRange(id: string) {
    this.api.delete('/settings/rate-ranges/' + id).subscribe({
      next: () => { this.snackbar.open('Rango eliminado', 'OK', { duration: 2000 }); this.loadRanges(); },
    });
  }

  toggleActive(type: any) {
    this.api.put('/settings/loan-types/' + type.id, { isActive: !type.isActive }).subscribe({
      next: () => this.load(),
    });
  }
}