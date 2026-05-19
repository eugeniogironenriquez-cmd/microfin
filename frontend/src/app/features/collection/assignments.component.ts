import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
import { ApiService, AuthService } from '../../core/index';

@Component({
  selector: 'app-assignments',
  standalone: true,
  imports: [
    CommonModule, DatePipe, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>assignment</mat-icon> Asignación de cobradores</h1>
      <a mat-stroked-button routerLink="/collection"><mat-icon>arrow_back</mat-icon> Cobranza</a>
    </div>

    <mat-card>
      <mat-card-header><mat-card-title>Nueva asignación</mat-card-title></mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="assign()" class="assign-form">
          <mat-form-field appearance="outline">
            <mat-label>Cobrador</mat-label>
            <mat-select formControlName="collectorId">
              @for (c of collectors(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }} — {{ c.email }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Fecha de visita</mat-label>
            <input matInput type="date" formControlName="date">
          </mat-form-field>

          <button mat-raised-button color="primary" type="submit" [disabled]="form.invalid || saving()">
            @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
            @else { <mat-icon>save</mat-icon> }
            Guardar asignación
          </button>
        </form>
        <p class="text-muted mt-16">Selecciona los créditos a asignar desde el módulo de Préstamos.</p>
      </mat-card-content>
    </mat-card>
  `
})
export class AssignmentsComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);
  collectors = signal<any[]>([]);
  saving = signal(false);

  form = this.fb.group({
    collectorId: ['', Validators.required],
    date: [new Date().toISOString().split('T')[0], Validators.required],
  });

  ngOnInit() {
    this.api.get<any[]>('/users/collectors').subscribe({ next: (c) => this.collectors.set(c) });
  }

  assign() {
    this.saving.set(true);
    this.api.post('/collection/assignments', { ...this.form.value, loanIds: [] }).subscribe({
      next: () => { this.snackbar.open('Asignación guardada', 'OK', { duration: 3000 }); this.saving.set(false); },
      error: () => this.saving.set(false),
    });
  }
}
