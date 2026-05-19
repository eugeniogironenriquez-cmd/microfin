import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { ApiService, LoanType } from '../../core/index';

// Etiqueta de unidad según frecuencia
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
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatSlideToggleModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>settings</mat-icon> Configuración</h1>
    </div>

    <div class="settings-layout">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Tipos de préstamo</mat-card-title>
          <div class="spacer"></div>
          <button mat-stroked-button color="primary" (click)="showForm.set(!showForm())">
            <mat-icon>{{ showForm() ? 'close' : 'add' }}</mat-icon>
            {{ showForm() ? 'Cancelar' : 'Nuevo tipo' }}
          </button>
        </mat-card-header>

        @if (showForm()) {
          <mat-card class="inner-form-card">
            <mat-card-content>
              <form [formGroup]="typeForm" (ngSubmit)="saveType()" class="type-form">

                <!-- Nombre -->
                <mat-form-field appearance="outline" class="col-span-2">
                  <mat-label>Nombre *</mat-label>
                  <input matInput formControlName="name" placeholder="Ej: Crédito Semanal">
                </mat-form-field>

                <!-- Tasa por defecto -->
                <mat-form-field appearance="outline">
                  <mat-label>Tasa por defecto</mat-label>
                  <input matInput type="number" step="0.001" formControlName="defaultRate">
                  <mat-hint>Ej: 0.05 = 5% por período</mat-hint>
                </mat-form-field>

                <!-- Montos -->
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

                <!-- Frecuencia -->
                <mat-form-field appearance="outline">
                  <mat-label>Frecuencia *</mat-label>
                  <mat-select formControlName="frequency"
                              (selectionChange)="onFrequencyChange()">
                    <mat-option value="DIARIO">Diario</mat-option>
                    <mat-option value="SEMANAL">Semanal</mat-option>
                    <mat-option value="QUINCENAL">Quincenal</mat-option>
                    <mat-option value="MENSUAL">Mensual</mat-option>
                  </mat-select>
                </mat-form-field>

                <!-- Plazo mínimo y máximo — etiqueta dinámica -->
                <mat-form-field appearance="outline">
                  <mat-label>Plazo mínimo ({{ unidad() }}) *</mat-label>
                  <input matInput type="number" formControlName="minTermWeeks">
                  <mat-hint>En {{ unidad() }}</mat-hint>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Plazo máximo ({{ unidad() }}) *</mat-label>
                  <input matInput type="number" formControlName="maxTermWeeks">
                  <mat-hint>En {{ unidad() }}</mat-hint>
                </mat-form-field>

                <!-- Moratorio: solo monto fijo por día + días de gracia -->
                <mat-form-field appearance="outline">
                  <mat-label>Monto moratorio por día de atraso</mat-label>
                  <input matInput type="number" step="1" formControlName="lateFeeFixedAmount">
                  <span matPrefix>$&nbsp;</span>
                  <mat-hint>Ej: 50 = $50 por cada día vencido</mat-hint>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Días de gracia</mat-label>
                  <input matInput type="number" formControlName="graceDays">
                  <mat-hint>Días sin cobrar moratorio tras vencer</mat-hint>
                </mat-form-field>

                <div class="form-actions col-span-2">
                  <button mat-raised-button color="primary" type="submit"
                          [disabled]="typeForm.invalid || saving()">
                    @if (saving()) { <mat-spinner diameter="18"></mat-spinner> }
                    @else { <mat-icon>save</mat-icon> }
                    Guardar
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
              <ng-container matColumnDef="rate">
                <th mat-header-cell *matHeaderCellDef>Tasa</th>
                <td mat-cell *matCellDef="let r">
                  {{ r.defaultRate ? (r.defaultRate * 100).toFixed(1) + '%' : '—' }}
                </td>
              </ng-container>
              <ng-container matColumnDef="amounts">
                <th mat-header-cell *matHeaderCellDef>Monto</th>
                <td mat-cell *matCellDef="let r">
                  {{ r.minAmount | number }} – {{ r.maxAmount | number }}
                </td>
              </ng-container>
              <ng-container matColumnDef="term">
                <th mat-header-cell *matHeaderCellDef>Plazo</th>
                <td mat-cell *matCellDef="let r">
                  {{ r.minTermWeeks }}–{{ r.maxTermWeeks }} {{ getUnidad(r.frequency) }}
                </td>
              </ng-container>
              <ng-container matColumnDef="freq">
                <th mat-header-cell *matHeaderCellDef>Frecuencia</th>
                <td mat-cell *matCellDef="let r">{{ r.frequency }}</td>
              </ng-container>
              <ng-container matColumnDef="moratorio">
                <th mat-header-cell *matHeaderCellDef>Moratorio/día</th>
                <td mat-cell *matCellDef="let r">
                  {{ r.lateFeeFixedAmount ? '$' + r.lateFeeFixedAmount : '—' }}
                  @if (r.graceDays > 0) {
                    <span class="text-muted" style="font-size:11px">
                      ({{ r.graceDays }}d gracia)
                    </span>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="active">
                <th mat-header-cell *matHeaderCellDef>Activo</th>
                <td mat-cell *matCellDef="let r">
                  <mat-slide-toggle [checked]="r.isActive"
                                    (change)="toggleActive(r)"></mat-slide-toggle>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="cols"></tr>
              <tr mat-row *matRowDef="let row; columns: cols;"></tr>
            </table>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .settings-layout { display:flex; flex-direction:column; gap:16px; }
    .inner-form-card { margin:0 16px 16px; background:#FAFAFA; }
    .type-form {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 8px;
    }
    .col-span-2 { grid-column: 1 / -1; }
    .spacer { flex:1; }
    @media(max-width:700px){ .type-form { grid-template-columns:1fr; } }
  `],
})
export class SettingsDashboardComponent implements OnInit {
  private api      = inject(ApiService);
  private fb       = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loanTypes = signal<LoanType[]>([]);
  loading   = signal(true);
  showForm  = signal(false);
  saving    = signal(false);
  unidad    = signal('semanas');

  cols = ['name', 'rate', 'amounts', 'term', 'freq', 'moratorio', 'active'];

  typeForm = this.fb.group({
    name:               ['', Validators.required],
    defaultRate:        [null as number | null],   // no obligatorio
    minAmount:          [500,  Validators.required],
    maxAmount:          [50000, Validators.required],
    frequency:          ['SEMANAL', Validators.required],
    minTermWeeks:       [4,  Validators.required],
    maxTermWeeks:       [52, Validators.required],
    lateFeeFixedAmount: [50],   // $50 por día de atraso por defecto
    graceDays:          [0],
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.get<LoanType[]>('/settings/loan-types').subscribe({
      next: (t) => { this.loanTypes.set(t); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onFrequencyChange() {
    const freq = this.typeForm.value.frequency || 'SEMANAL';
    this.unidad.set(unidadPlazo(freq));
    // Resetear plazos al cambiar frecuencia
    this.typeForm.patchValue({ minTermWeeks: 1, maxTermWeeks: null });
  }

  getUnidad(freq: string): string { return unidadPlazo(freq); }

  saveType() {
    if (this.typeForm.invalid) return;
    this.saving.set(true);
    // Mapear al formato que espera el backend (lateFeeFixedAmount → campos de moratorio)
    const val = this.typeForm.value;
    const payload = {
      name:               val.name,
      defaultRate:        val.defaultRate || 0,
      minRate:            0,
      maxRate:            1,
      minAmount:          val.minAmount,
      maxAmount:          val.maxAmount,
      frequency:          val.frequency,
      minTermWeeks:       val.minTermWeeks,
      maxTermWeeks:       val.maxTermWeeks,
      graceDays:          val.graceDays || 0,
      lateFeeFixedAmount: val.lateFeeFixedAmount || 0,
      // Campos legacy que el backend aún puede requerir
      lateFeeFactor:      1,
      lateFeeType:        'FIJO',
      lateFeeRate:        null,
      lateFeeRateBasis:   'DIARIA',
    };
    this.api.post('/settings/loan-types', payload).subscribe({
      next: () => {
        this.snackbar.open('Tipo de préstamo guardado', 'OK', { duration: 3000 });
        this.saving.set(false);
        this.showForm.set(false);
        this.typeForm.reset({
          frequency: 'SEMANAL', minAmount: 500, maxAmount: 50000,
          minTermWeeks: 4, maxTermWeeks: 52, lateFeeFixedAmount: 50, graceDays: 0,
        });
        this.unidad.set('semanas');
        this.load();
      },
      error: (err: any) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error al guardar', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  toggleActive(type: any) {
    this.api.put(`/settings/loan-types/${type.id}`, { isActive: !type.isActive }).subscribe({
      next: () => this.load(),
    });
  }
}