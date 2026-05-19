import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>{{ isEdit() ? 'edit' : 'person_add' }}</mat-icon>
        {{ isEdit() ? 'Editar usuario' : 'Nuevo usuario' }}</h1>
      <a mat-stroked-button routerLink="/users"><mat-icon>arrow_back</mat-icon> Usuarios</a>
    </div>

    <mat-card style="max-width:500px">
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="save()" class="user-form">
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Nombre completo *</mat-label>
            <input matInput formControlName="name">
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Correo electrónico *</mat-label>
            <input matInput type="email" formControlName="email">
          </mat-form-field>

          @if (!isEdit()) {
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Contraseña *</mat-label>
              <input matInput type="password" formControlName="password">
              <mat-hint>Mínimo 8 chars, una mayúscula y un número</mat-hint>
            </mat-form-field>
          }

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Rol *</mat-label>
            <mat-select formControlName="role">
              <mat-option value="ADMIN">Administrador</mat-option>
              <mat-option value="CAJERO">Cajero</mat-option>
              <mat-option value="AUTORIZADOR">Autorizador</mat-option>
              <mat-option value="COBRADOR">Cobrador</mat-option>
            </mat-select>
          </mat-form-field>

          <div class="form-actions">
            <a mat-stroked-button routerLink="/users">Cancelar</a>
            <button mat-raised-button color="primary" type="submit" [disabled]="form.invalid || saving()">
              @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { <mat-icon>save</mat-icon> }
              {{ isEdit() ? 'Guardar cambios' : 'Crear usuario' }}
            </button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>
  `
})
export class UserFormComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  isEdit = signal(false);
  saving = signal(false);

  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    role: ['CAJERO', Validators.required],
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.form.get('password')?.clearValidators();
      this.api.get<any>(`/users/${id}`).subscribe((u) => this.form.patchValue(u));
    } else {
      this.form.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
    }
  }

  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const id = this.route.snapshot.paramMap.get('id');
    const req = id
      ? this.api.put<any>(`/users/${id}`, this.form.value)
      : this.api.post<any>('/users', this.form.value);
    req.subscribe({
      next: () => {
        this.snackbar.open(this.isEdit() ? 'Usuario actualizado' : 'Usuario creado', 'OK', { duration: 3000 });
        this.router.navigate(['/users']);
      },
      error: (err) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }
}
