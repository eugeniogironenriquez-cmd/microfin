import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  selector: 'app-semaforo-config',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>tune</mat-icon> Configuración del semáforo</h1>
    </div>

    <mat-card style="max-width:600px">
      <mat-card-content>
        <div class="info-box">
          <mat-icon>info</mat-icon>
          <div>
            <strong>Umbrales del semáforo de cartera</strong>
            <p>Define cuántas cuotas vencidas determinan cada color. El semáforo clasifica
               automáticamente todos los créditos activos.</p>
          </div>
        </div>

        @if (loading()) {
          <div style="display:flex;justify-content:center;padding:24px">
            <mat-spinner diameter="36"></mat-spinner>
          </div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()" class="cfg-form">
            <div class="nivel-row">
              <span class="dot verde"></span>
              <div class="nivel-text">
                <strong>Verde — Al corriente</strong>
                <span>Hasta esta cantidad de cuotas vencidas</span>
              </div>
              <mat-form-field appearance="outline" class="num-field">
                <input matInput type="number" formControlName="greenUpTo">
              </mat-form-field>
            </div>

            <div class="nivel-row">
              <span class="dot amarillo"></span>
              <div class="nivel-text">
                <strong>Amarillo — En riesgo</strong>
                <span>Desde {{ (form.value.greenUpTo ?? 0) + 1 }} hasta esta cantidad</span>
              </div>
              <mat-form-field appearance="outline" class="num-field">
                <input matInput type="number" formControlName="yellowUpTo">
              </mat-form-field>
            </div>

            <div class="nivel-row">
              <span class="dot rojo"></span>
              <div class="nivel-text">
                <strong>Rojo — Crítico</strong>
                <span>Más de {{ form.value.yellowUpTo ?? 5 }} cuotas vencidas (gestión de cobranza)</span>
              </div>
              <div class="num-field rojo-fixed">{{ (form.value.yellowUpTo ?? 5) + 1 }}+</div>
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
      background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px;
      padding:14px; margin-bottom:20px;
    }
    .info-box mat-icon { color:#2563EB; }
    .info-box strong { color:#1E40AF; }
    .info-box p { margin:4px 0 0; font-size:13px; color:#1E40AF; }
    .cfg-form { display:flex; flex-direction:column; gap:14px; }
    .nivel-row {
      display:flex; align-items:center; gap:14px;
      padding:12px 14px; border:1px solid #E2E8F0; border-radius:10px;
    }
    .dot { width:20px; height:20px; border-radius:50%; flex-shrink:0; }
    .dot.verde    { background:#16A34A; box-shadow:0 0 0 4px #BBF7D0; }
    .dot.amarillo { background:#F59E0B; box-shadow:0 0 0 4px #FDE68A; }
    .dot.rojo     { background:#DC2626; box-shadow:0 0 0 4px #FECACA; }
    .nivel-text { flex:1; display:flex; flex-direction:column; }
    .nivel-text strong { font-size:14px; }
    .nivel-text span { font-size:12px; color:#718096; }
    .num-field { width:90px; }
    .rojo-fixed {
      width:90px; text-align:center; font-weight:700; color:#DC2626; font-size:18px;
    }
    .form-actions { display:flex; justify-content:flex-end; margin-top:8px; }
  `],
})
export class SemaforoConfigComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loading = signal(true);
  saving = signal(false);

  form = this.fb.group({
    greenUpTo:  [0, [Validators.required, Validators.min(0)]],
    yellowUpTo: [5, [Validators.required, Validators.min(1)]],
  });

  ngOnInit() {
    this.api.get<any>('/semaforo/config').subscribe({
      next: (cfg) => {
        this.form.patchValue({ greenUpTo: cfg.greenUpTo, yellowUpTo: cfg.yellowUpTo });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  save() {
    if (this.form.invalid) return;
    const g = Number(this.form.value.greenUpTo);
    const y = Number(this.form.value.yellowUpTo);
    if (y <= g) {
      this.snackbar.open('El umbral amarillo debe ser mayor que el verde', 'Cerrar', { duration: 4000 });
      return;
    }
    this.saving.set(true);
    this.api.put('/semaforo/config', { greenUpTo: g, yellowUpTo: y }).subscribe({
      next: () => {
        this.snackbar.open('Configuración guardada', 'OK', { duration: 3000 });
        this.saving.set(false);
      },
      error: (err) => {
        this.snackbar.open(err.error?.message || 'Error al guardar', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }
}