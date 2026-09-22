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
              <mat-hint>Mínimo 8 caracteres</mat-hint>
            </mat-form-field>
          }

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Rol *</mat-label>
            <mat-select formControlName="roleId">
              @if (loadingRoles()) {
                <mat-option disabled>Cargando roles...</mat-option>
              }
              @for (r of roles(); track r.id) {
                <mat-option [value]="r.id">
                  {{ r.name }}
                  @if (r.isAdmin) { (acceso total) }
                </mat-option>
              }
            </mat-select>
            <mat-hint>Define qué permisos tendrá el usuario</mat-hint>
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
  roles = signal<any[]>([]);
  loadingRoles = signal(true);

  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    roleId: ['', Validators.required],
  });

  ngOnInit() {
    // Cargar roles dinámicos
    this.api.get<any[]>('/roles').subscribe({
      next: (data) => {
        this.roles.set(data.filter(r => r.isActive !== false));
        this.loadingRoles.set(false);
        // Si es alta nueva, preseleccionar el rol CAJERO si existe
        if (!this.isEdit()) {
          const cajero = this.roles().find(r => r.name === 'CAJERO');
          if (cajero) this.form.patchValue({ roleId: cajero.id });
        }
      },
      error: () => this.loadingRoles.set(false),
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.form.get('password')?.clearValidators();
      this.form.get('password')?.updateValueAndValidity();
      this.api.get<any>(`/users/${id}`).subscribe((u) => {
        this.form.patchValue({
          name: u.name,
          email: u.email,
          roleId: u.roleId || '',
        });
      });
    } else {
      this.form.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
      this.form.get('password')?.updateValueAndValidity();
    }
  }

  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const id = this.route.snapshot.paramMap.get('id');
    const body: any = {
      name: this.form.value.name,
      roleId: this.form.value.roleId,
    };
    if (!id) {
      body.email = this.form.value.email;
      body.password = this.form.value.password;
    }

    const req = id
      ? this.api.put<any>(`/users/${id}`, body)
      : this.api.post<any>('/users', body);
    req.subscribe({
      next: () => {
        this.snackbar.open(this.isEdit() ? 'Usuario actualizado' : 'Usuario creado', 'OK', { duration: 3000 });
        this.router.navigate(['/users']);
      },
      error: (err) => {
        this.snackbar.open(err.error?.message?.[0] || err.error?.message || 'Error', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }
}