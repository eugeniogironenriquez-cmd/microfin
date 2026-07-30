import { Component, OnInit, inject, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-guarantor-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatDividerModule,
  ],
  template: `
    <mat-card class="guarantor-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>people</mat-icon> Datos del Aval
        </mat-card-title>
        <mat-card-subtitle>Requerido para toda solicitud de crédito</mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        @if (loading()) {
          <div class="loading-overlay"><mat-spinner diameter="36"></mat-spinner></div>
        } @else {
          <!-- Aviso de aval único -->
          <div class="aval-info">
            <mat-icon>info</mat-icon>
            <span>Un aval no puede respaldar más de un crédito activo o vencido al mismo tiempo.</span>
          </div>

          <form [formGroup]="form" (ngSubmit)="save()">
            <div class="form-grid">
              <mat-form-field appearance="outline" class="col-span-2">
                <mat-label>Nombre completo *</mat-label>
                <input matInput formControlName="fullName">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>CURP *</mat-label>
                <input matInput formControlName="curp" style="text-transform:uppercase">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Teléfono *</mat-label>
                <input matInput formControlName="phone" maxlength="10">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Parentesco / Relación</mat-label>
                <mat-select formControlName="relationship">
                  <mat-option value="Cónyuge">Cónyuge</mat-option>
                  <mat-option value="Padre/Madre">Padre / Madre</mat-option>
                  <mat-option value="Hijo/Hija">Hijo / Hija</mat-option>
                  <mat-option value="Hermano/Hermana">Hermano / Hermana</mat-option>
                  <mat-option value="Amigo">Amigo</mat-option>
                  <mat-option value="Conocido">Conocido</mat-option>
                  <mat-option value="Otro">Otro</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Ocupación</mat-label>
                <input matInput formControlName="occupation">
              </mat-form-field>

              <mat-form-field appearance="outline" class="col-span-2">
                <mat-label>Domicilio completo</mat-label>
                <textarea matInput formControlName="address" rows="2"
                  placeholder="Calle, número, colonia, municipio, estado, CP"></textarea>
              </mat-form-field>
            </div>

            <div class="form-actions">
              <button mat-raised-button color="primary" type="submit"
                      [disabled]="form.invalid || saving()">
                @if (saving()) { <mat-spinner diameter="18"></mat-spinner> }
                @else { <mat-icon>save</mat-icon> }
                {{ existing() ? 'Actualizar aval' : 'Registrar aval' }}
              </button>
            </div>
          </form>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .aval-info {
      display:flex; align-items:center; gap:8px; padding:10px 12px;
      background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px;
      margin-bottom:16px; font-size:13px; color:#1E40AF;
    }
    .aval-info mat-icon { color:#2563EB; flex-shrink:0; }
  `],
})
export class GuarantorFormComponent implements OnInit {
  @Input() loanId!: string;

  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loading = signal(true);
  saving = signal(false);
  existing = signal(false);

  form = this.fb.group({
    fullName:     ['', Validators.required],
    curp:         ['', [Validators.required, Validators.pattern(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/)]],
    rfc:          [''],
    phone:        ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    email:        ['', Validators.email],
    relationship: [''],
    occupation:   [''],
    address:      [''],
  });

  ngOnInit() {
    if (!this.loanId) { this.loading.set(false); return; }
    this.api.get<any>(`/loans/${this.loanId}/guarantor`).subscribe({
      next: (g) => {
        if (g) { this.form.patchValue(g); this.existing.set(true); }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const dto = { ...this.form.value, curp: (this.form.value.curp || '').toUpperCase(), rfc: (this.form.value.rfc || '').toUpperCase() };
    // Si ya existe, usar PUT (edición); si no, POST (alta)
    const req = this.existing()
      ? this.api.put<any>(`/loans/${this.loanId}/guarantor`, dto)
      : this.api.post<any>(`/loans/${this.loanId}/guarantor`, dto);
    req.subscribe({
      next: () => {
        this.snackbar.open(this.existing() ? 'Aval actualizado' : 'Aval registrado', 'OK', { duration: 3000 });
        this.existing.set(true);
        this.saving.set(false);
      },
      error: (err) => {
        const msg = Array.isArray(err.error?.message)
          ? err.error.message[0]
          : (err.error?.message || 'Error al guardar');
        this.snackbar.open(msg, 'Cerrar', { duration: 6000 });
        this.saving.set(false);
      },
    });
  }
}