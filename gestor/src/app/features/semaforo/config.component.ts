import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { GestorService } from '../../core/gestor.service';

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatIconModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-container narrow">
      <div class="page-header">
        <h1><mat-icon>tune</mat-icon> Umbrales del semáforo</h1>
      </div>

      <p class="intro">
        Define cuántas cuotas vencidas separan cada nivel. El semáforo clasifica
        cada crédito automáticamente según estos límites.
      </p>

      @if (loading()) {
        <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
      } @else {
        <mat-card class="cfg-card">
          <form [formGroup]="form" (ngSubmit)="guardar()">
            <div class="nivel-row verde">
              <span class="dot dot-verde"></span>
              <div class="nivel-info">
                <strong>Verde — Al corriente</strong>
                <span>Hasta {{ form.value.greenUpTo }} cuotas vencidas</span>
              </div>
              <mat-form-field appearance="outline" class="num">
                <mat-label>Máx.</mat-label>
                <input matInput type="number" formControlName="greenUpTo" min="0">
              </mat-form-field>
            </div>

            <div class="nivel-row amarillo">
              <span class="dot dot-amarillo"></span>
              <div class="nivel-info">
                <strong>Amarillo — En riesgo</strong>
                <span>Hasta {{ form.value.yellowUpTo }} cuotas vencidas</span>
              </div>
              <mat-form-field appearance="outline" class="num">
                <mat-label>Máx.</mat-label>
                <input matInput type="number" formControlName="yellowUpTo" min="1">
              </mat-form-field>
            </div>

            <div class="nivel-row rojo">
              <span class="dot dot-rojo"></span>
              <div class="nivel-info">
                <strong>Rojo — Crítico</strong>
                <span>Más de {{ form.value.yellowUpTo }} cuotas vencidas</span>
              </div>
              <div class="num-fixed">Automático</div>
            </div>

            <div class="actions">
              <button mat-raised-button color="primary" type="submit" [disabled]="saving() || form.invalid">
                @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                @else { <ng-container><mat-icon>save</mat-icon> Guardar cambios</ng-container> }
              </button>
            </div>
          </form>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .narrow { max-width: 640px; }
    .intro { color: var(--gray-600); font-size: 14px; margin: 0 0 16px; }
    .center { display: flex; justify-content: center; padding: 48px; }
    .cfg-card { padding: 20px; }
    .nivel-row {
      display: flex; align-items: center; gap: 14px;
      padding: 14px; border-radius: 10px; margin-bottom: 12px;
    }
    .nivel-row.verde    { background: #f0fdf4; }
    .nivel-row.amarillo { background: #fffbeb; }
    .nivel-row.rojo     { background: #fef2f2; }
    .nivel-row .dot { width: 16px; height: 16px; }
    .nivel-info { flex: 1; display: flex; flex-direction: column; }
    .nivel-info strong { color: var(--gray-900); }
    .nivel-info span { font-size: 13px; color: var(--gray-600); }
    .num { width: 90px; }
    .num-fixed { color: var(--gray-400); font-size: 13px; font-style: italic; width: 90px; text-align: center; }
    .actions { text-align: right; margin-top: 8px; }
  `],
})
export class ConfigComponent implements OnInit {
  private fb = inject(FormBuilder);
  private gestor = inject(GestorService);
  private snack = inject(MatSnackBar);

  loading = signal(true);
  saving = signal(false);

  form = this.fb.group({
    greenUpTo: [0, [Validators.required, Validators.min(0)]],
    yellowUpTo: [5, [Validators.required, Validators.min(1)]],
  });

  ngOnInit() {
    this.gestor.getConfig().subscribe({
      next: (cfg) => {
        this.form.patchValue({ greenUpTo: cfg.greenUpTo, yellowUpTo: cfg.yellowUpTo });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  guardar() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.gestor.updateConfig({
      greenUpTo: Number(this.form.value.greenUpTo),
      yellowUpTo: Number(this.form.value.yellowUpTo),
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('Umbrales actualizados', 'OK', { duration: 3000 });
      },
      error: (err) => {
        this.saving.set(false);
        this.snack.open(err?.error?.message || 'No se pudo guardar', 'Cerrar', { duration: 4000 });
      },
    });
  }
}
