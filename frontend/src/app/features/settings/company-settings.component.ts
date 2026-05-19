import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatDividerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>business</mat-icon> Datos de la empresa</h1>
    </div>

    <mat-card class="settings-card">
      <mat-card-content>
        @if (loading()) {
          <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()">

            <h3 class="section-title">Información general</h3>
            <div class="form-grid">
              <mat-form-field appearance="outline" class="col-span-2">
                <mat-label>Nombre de la empresa *</mat-label>
                <input matInput formControlName="name">
                <mat-icon matPrefix>business</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>RFC</mat-label>
                <input matInput formControlName="rfc" style="text-transform:uppercase">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Régimen fiscal</mat-label>
                <input matInput formControlName="fiscalRegime">
              </mat-form-field>
            </div>

            <mat-divider class="divider"></mat-divider>
            <h3 class="section-title">Contacto</h3>
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Teléfono</mat-label>
                <input matInput formControlName="phone">
                <mat-icon matPrefix>phone</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <input matInput type="email" formControlName="email">
                <mat-icon matPrefix>email</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Sitio web</mat-label>
                <input matInput formControlName="website">
                <mat-icon matPrefix>language</mat-icon>
              </mat-form-field>
            </div>

            <mat-divider class="divider"></mat-divider>
            <h3 class="section-title">Domicilio fiscal</h3>
            <div class="form-grid">
              <mat-form-field appearance="outline" class="col-span-2">
                <mat-label>Dirección completa</mat-label>
                <textarea matInput formControlName="address" rows="2"></textarea>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Ciudad</mat-label>
                <input matInput formControlName="city">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Estado</mat-label>
                <input matInput formControlName="state">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Código postal</mat-label>
                <input matInput formControlName="zip" maxlength="5">
              </mat-form-field>
            </div>

            <mat-divider class="divider"></mat-divider>
            <h3 class="section-title">Documentos</h3>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Texto legal en comprobantes y contratos</mat-label>
              <textarea matInput formControlName="legalFooter" rows="3"
                placeholder="Ej: Este documento es un comprobante válido de operación financiera..."></textarea>
            </mat-form-field>

            <div class="form-actions">
              <button mat-raised-button color="primary" type="submit" [disabled]="form.invalid || saving()">
                @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
                @else { <mat-icon>save</mat-icon> }
                Guardar cambios
              </button>
            </div>
          </form>
        }
      </mat-card-content>
    </mat-card>
  `
})
export class CompanySettingsComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loading = signal(true);
  saving = signal(false);

  form = this.fb.group({
    name: ['', Validators.required],
    rfc: [''],
    fiscalRegime: [''],
    phone: [''],
    email: ['', Validators.email],
    website: [''],
    address: [''],
    city: [''],
    state: [''],
    zip: [''],
    legalFooter: [''],
  });

  ngOnInit() {
    this.api.get<any>('/company').subscribe({
      next: (data) => { this.form.patchValue(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.put<any>('/company', this.form.value).subscribe({
      next: () => {
        this.snackbar.open('Datos guardados correctamente', 'OK', { duration: 3000 });
        this.saving.set(false);
      },
      error: () => { this.snackbar.open('Error al guardar', 'Cerrar', { duration: 4000 }); this.saving.set(false); },
    });
  }
}
