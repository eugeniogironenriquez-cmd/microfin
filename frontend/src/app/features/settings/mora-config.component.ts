import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-mora-config',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>gavel</mat-icon> Configuración de mora</h1>
    </div>

    <mat-card style="max-width:560px">
      <mat-card-content>
        <div class="info-box">
          <mat-icon>info</mat-icon>
          <div>
            <strong>Mora por día de atraso</strong>
            <p>Se cobra este monto fijo por cada día hábil (lunes a viernes) que una cuota
               permanezca vencida. Aplica a todos los créditos por igual.</p>
          </div>
        </div>

        @if (loading()) {
          <div style="display:flex;justify-content:center;padding:24px">
            <mat-spinner diameter="36"></mat-spinner>
          </div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()" class="mora-form">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Mora por día *</mat-label>
              <input matInput type="number" step="0.01" formControlName="moraPorDia">
              <span matPrefix>$&nbsp;</span>
              <mat-hint>Monto fijo por cada día hábil de atraso</mat-hint>
            </mat-form-field>

            <div class="example-box">
              <span>Ejemplo: una cuota con 5 días hábiles de atraso genera</span>
              <strong>{{ (form.value.moraPorDia || 0) * 5 | currency:'MXN' }}</strong>
              <span>de mora</span>
            </div>

            <div class="form-actions">
              <button mat-raised-button color="primary" type="submit"
                      [disabled]="form.invalid || saving()">
                @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                @else { <mat-icon>save</mat-icon> }
                Guardar
              </button>
            </div>
          </form>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .info-box {
      display:flex; gap:12px; align-items:flex-start;
      background:#FFFBEB; border:1px solid #FDE68A; border-radius:8px;
      padding:14px; margin-bottom:20px;
    }
    .info-box mat-icon { color:#D97706; }
    .info-box strong { color:#92400E; }
    .info-box p { margin:4px 0 0; font-size:13px; color:#92400E; }
    .mora-form { display:flex; flex-direction:column; gap:8px; }
    .w-full { width:100%; }
    .example-box {
      display:flex; align-items:center; gap:6px; flex-wrap:wrap;
      background:#F0FFF4; border-radius:8px; padding:12px 14px;
      font-size:13px; color:#276749; margin:8px 0 16px;
    }
    .example-box strong { color:#1C4532; font-size:16px; }
    .form-actions { display:flex; justify-content:flex-end; }
  `],
})
export class MoraConfigComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loading = signal(true);
  saving = signal(false);

  form = this.fb.group({
    moraPorDia: [50, [Validators.required, Validators.min(0)]],
  });

  ngOnInit() {
    this.api.get<any>('/config-mora').subscribe({
      next: (cfg) => {
        this.form.patchValue({ moraPorDia: Number(cfg.moraPorDia) });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.put('/config-mora', { moraPorDia: Number(this.form.value.moraPorDia) }).subscribe({
      next: () => {
        this.snackbar.open('Configuración de mora guardada', 'OK', { duration: 3000 });
        this.saving.set(false);
      },
      error: (err) => {
        this.snackbar.open(err.error?.message || 'Error al guardar', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }
}