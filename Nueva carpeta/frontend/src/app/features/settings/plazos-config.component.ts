import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-plazos-config',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatTableModule, MatProgressSpinnerModule, MatSnackBarModule,
    MatSlideToggleModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>tune</mat-icon> Configuración de plazos</h1>
    </div>

    <!-- Fórmula explicativa -->
    <mat-card class="formula-card">
      <mat-card-content>
        <div class="formula-box">
          <mat-icon>functions</mat-icon>
          <div>
            <strong>Fórmula de cálculo</strong>
            <p>Total a pagar = Monto × Porcentaje × 4 + Monto</p>
            <p class="formula-sub">Cuota diaria = Total a pagar ÷ Días &nbsp;·&nbsp; el plazo en días determina el porcentaje automáticamente</p>
          </div>
        </div>
      </mat-card-content>
    </mat-card>

    <!-- Alta de nuevo plazo -->
    <mat-card class="mb-16">
      <mat-card-header><mat-card-title>Agregar plazo</mat-card-title></mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="add()" class="add-form">
          <mat-form-field appearance="outline">
            <mat-label>Días *</mat-label>
            <input matInput type="number" formControlName="days" placeholder="30">
            <span matSuffix>días</span>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Porcentaje *</mat-label>
            <input matInput type="number" formControlName="percentagePct" placeholder="7" step="0.1">
            <span matSuffix>%</span>
            <mat-hint>Ej: 7 para 7%</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" class="desc-field">
            <mat-label>Descripción</mat-label>
            <input matInput formControlName="description" placeholder="Opcional">
          </mat-form-field>

          @if (previewCuota()) {
            <div class="preview-chip">
              <span>Ejemplo $5,000:</span>
              <strong>{{ previewCuota() }}</strong>
            </div>
          }

          <button mat-raised-button color="primary" type="submit" [disabled]="form.invalid || saving()">
            @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
            @else { <mat-icon>add</mat-icon> }
            Agregar
          </button>
        </form>
      </mat-card-content>
    </mat-card>

    <!-- Lista de plazos -->
    <mat-card>
      <mat-card-header><mat-card-title>Plazos configurados</mat-card-title></mat-card-header>
      <mat-card-content>
        @if (loading()) {
          <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
        } @else {
          <table mat-table [dataSource]="plazos()" class="w-full">
            <ng-container matColumnDef="days">
              <th mat-header-cell *matHeaderCellDef>Días</th>
              <td mat-cell *matCellDef="let p">
                @if (editId() === p.id) {
                  <mat-form-field appearance="outline" class="edit-field">
                    <input matInput type="number" [value]="editDays()"
                           (input)="editDays.set(+$any($event.target).value)">
                  </mat-form-field>
                } @else {
                  <strong>{{ p.days }}</strong> días
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="percentage">
              <th mat-header-cell *matHeaderCellDef>Porcentaje</th>
              <td mat-cell *matCellDef="let p">
                @if (editId() === p.id) {
                  <mat-form-field appearance="outline" class="edit-field">
                    <input matInput type="number" step="0.1" [value]="editPct()"
                           (input)="editPct.set(+$any($event.target).value)">
                    <span matSuffix>%</span>
                  </mat-form-field>
                } @else {
                  {{ (p.percentage * 100).toFixed(1) }}%
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="ejemplo">
              <th mat-header-cell *matHeaderCellDef>Cuota diaria ($5,000)</th>
              <td mat-cell *matCellDef="let p">{{ cuotaEjemplo(p.days, p.percentage) }}</td>
            </ng-container>

            <ng-container matColumnDef="description">
              <th mat-header-cell *matHeaderCellDef>Descripción</th>
              <td mat-cell *matCellDef="let p">
                @if (editId() === p.id) {
                  <mat-form-field appearance="outline" class="edit-field-wide">
                    <input matInput [value]="editDesc()"
                           (input)="editDesc.set($any($event.target).value)">
                  </mat-form-field>
                } @else {
                  {{ p.description || '—' }}
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="active">
              <th mat-header-cell *matHeaderCellDef>Activo</th>
              <td mat-cell *matCellDef="let p">
                <mat-slide-toggle [checked]="p.isActive"
                                  (change)="toggleActive(p, $event.checked)"
                                  color="primary"></mat-slide-toggle>
              </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let p">
                @if (editId() === p.id) {
                  <button mat-icon-button color="primary" (click)="saveEdit(p)" matTooltip="Guardar">
                    <mat-icon>check</mat-icon>
                  </button>
                  <button mat-icon-button (click)="cancelEdit()" matTooltip="Cancelar">
                    <mat-icon>close</mat-icon>
                  </button>
                } @else {
                  <button mat-icon-button (click)="startEdit(p)" matTooltip="Editar">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button mat-icon-button color="warn" (click)="remove(p)" matTooltip="Eliminar">
                    <mat-icon>delete</mat-icon>
                  </button>
                }
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>
          </table>

          @if (plazos().length === 0) {
            <div class="empty-state">
              <mat-icon>tune</mat-icon>
              <p>No hay plazos configurados. Agrega el primero arriba.</p>
            </div>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .formula-card { background:#F0FFF4; border:1px solid #C6F6D5; margin-bottom:16px; }
    .formula-box { display:flex; align-items:flex-start; gap:14px; }
    .formula-box mat-icon { color:#1C4532; font-size:32px; width:32px; height:32px; }
    .formula-box p { margin:4px 0 0; font-family:Consolas,monospace; color:#1C4532; font-weight:600; }
    .formula-sub { font-size:12px; color:#276749 !important; font-weight:400 !important; }
    .add-form {
      display:flex; align-items:flex-start; gap:12px; flex-wrap:wrap;
    }
    .add-form mat-form-field { width:140px; }
    .add-form .desc-field { width:240px; }
    .preview-chip {
      display:flex; flex-direction:column; padding:8px 14px;
      background:#EBF8FF; border-radius:8px; font-size:13px;
    }
    .preview-chip strong { color:#1C4532; font-size:16px; }
    .edit-field { width:90px; }
    .edit-field-wide { width:200px; }
    .edit-field ::ng-deep .mat-mdc-form-field-subscript-wrapper,
    .edit-field-wide ::ng-deep .mat-mdc-form-field-subscript-wrapper { display:none; }
    .mb-16 { margin-bottom:16px; }
    .w-full { width:100%; }
  `],
})
export class PlazosConfigComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  plazos = signal<any[]>([]);
  loading = signal(true);
  saving = signal(false);
  cols = ['days', 'percentage', 'ejemplo', 'description', 'active', 'actions'];

  // Edición en línea
  editId   = signal<string | null>(null);
  editDays = signal<number>(0);
  editPct  = signal<number>(0);   // en %
  editDesc = signal<string>('');

  form = this.fb.group({
    days:          [null as number | null, [Validators.required, Validators.min(1)]],
    percentagePct: [null as number | null, [Validators.required, Validators.min(0)]],
    description:   [''],
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    // /plazos-credito/all devuelve todos (activos e inactivos) para administración
    this.api.get<any[]>('/plazos-credito/all').subscribe({
      next: (data) => { this.plazos.set(data); this.loading.set(false); },
      error: () => {
        // Fallback a la lista activa si /all no está disponible
        this.api.get<any[]>('/plazos-credito').subscribe({
          next: (d) => { this.plazos.set(d); this.loading.set(false); },
          error: () => this.loading.set(false),
        });
      },
    });
  }

  // Cuota diaria de ejemplo con $5,000
  cuotaEjemplo(days: number, percentage: number): string {
    const total = 5000 * percentage * 4 + 5000;
    const cuota = total / days;
    return '$' + cuota.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  previewCuota(): string {
    const days = Number(this.form.value.days);
    const pct  = Number(this.form.value.percentagePct) / 100;
    if (!days || pct < 0 || isNaN(pct)) return '';
    return this.cuotaEjemplo(days, pct);
  }

  add() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const body = {
      days: Number(this.form.value.days),
      percentage: Number(this.form.value.percentagePct) / 100,  // % -> decimal
      description: this.form.value.description || undefined,
    };
    this.api.post('/plazos-credito', body).subscribe({
      next: () => {
        this.snackbar.open('Plazo agregado', 'OK', { duration: 3000 });
        this.form.reset();
        this.saving.set(false);
        this.load();
      },
      error: (err) => {
        this.snackbar.open(err.error?.message || 'Error al agregar', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  startEdit(p: any) {
    this.editId.set(p.id);
    this.editDays.set(p.days);
    this.editPct.set(Number((p.percentage * 100).toFixed(2)));
    this.editDesc.set(p.description || '');
  }

  cancelEdit() { this.editId.set(null); }

  saveEdit(p: any) {
    const body = {
      days: this.editDays(),
      percentage: this.editPct() / 100,
      description: this.editDesc(),
    };
    this.api.put(`/plazos-credito/${p.id}`, body).subscribe({
      next: () => {
        this.snackbar.open('Plazo actualizado', 'OK', { duration: 3000 });
        this.editId.set(null);
        this.load();
      },
      error: (err) => {
        this.snackbar.open(err.error?.message || 'Error al guardar', 'Cerrar', { duration: 5000 });
      },
    });
  }

  toggleActive(p: any, active: boolean) {
    this.api.put(`/plazos-credito/${p.id}`, { isActive: active }).subscribe({
      next: () => this.snackbar.open(active ? 'Plazo activado' : 'Plazo desactivado', 'OK', { duration: 2000 }),
      error: () => { this.load(); this.snackbar.open('Error al cambiar estado', 'Cerrar', { duration: 4000 }); },
    });
  }

  remove(p: any) {
    if (!confirm(`¿Eliminar el plazo de ${p.days} días? Esta acción no se puede deshacer.`)) return;
    this.api.delete(`/plazos-credito/${p.id}`).subscribe({
      next: () => { this.snackbar.open('Plazo eliminado', 'OK', { duration: 3000 }); this.load(); },
      error: (err) => this.snackbar.open(err.error?.message || 'No se pudo eliminar', 'Cerrar', { duration: 5000 }),
    });
  }
}