import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/index';

interface PermisoItem { key: string; module: string; action: string; }

@Component({
  selector: 'app-role-form',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatCheckboxModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatDividerModule,
  ],
  template: `
    <div class="page-header">
      <h1>
        <mat-icon>{{ isEdit() ? 'edit' : 'add' }}</mat-icon>
        {{ isEdit() ? 'Editar rol' : 'Nuevo rol' }}
      </h1>
      <a mat-stroked-button routerLink="/roles">
        <mat-icon>arrow_back</mat-icon> Regresar
      </a>
    </div>

    @if (loading()) {
      <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="save()">
        <mat-card class="mb-16">
          <mat-card-content>
            @if (isAdmin()) {
              <div class="admin-notice">
                <mat-icon>stars</mat-icon>
                <div>
                  <strong>Rol de super administrador</strong>
                  <p>Este rol siempre tiene acceso a todo el sistema. Los permisos no son editables.</p>
                </div>
              </div>
            }

            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Nombre del rol *</mat-label>
                <input matInput formControlName="name" placeholder="Ej: Supervisor de cobranza"
                       [readonly]="isSystem()">
                @if (isSystem()) {
                  <mat-hint>Los roles base no se pueden renombrar</mat-hint>
                }
                <mat-error>El nombre es obligatorio</mat-error>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Descripción</mat-label>
                <input matInput formControlName="description"
                       placeholder="Breve descripción del rol">
              </mat-form-field>
            </div>
          </mat-card-content>
        </mat-card>

        @if (!isAdmin()) {
          <mat-card>
            <mat-card-content>
              <div class="permisos-header">
                <h3>Permisos del rol</h3>
                <div class="permisos-actions">
                  <button mat-stroked-button type="button" (click)="selectAll()">
                    <mat-icon>done_all</mat-icon> Todos
                  </button>
                  <button mat-stroked-button type="button" (click)="clearAll()">
                    <mat-icon>remove_done</mat-icon> Ninguno
                  </button>
                </div>
              </div>
              <p class="permisos-count">{{ selectedKeys().length }} permisos seleccionados</p>

              <mat-divider class="my-divider"></mat-divider>

              @for (mod of modules(); track mod) {
                <div class="modulo-block">
                  <div class="modulo-title">
                    <mat-checkbox
                      [checked]="isModuleFullySelected(mod)"
                      [indeterminate]="isModulePartiallySelected(mod)"
                      (change)="toggleModule(mod, $event.checked)">
                      <strong>{{ mod }}</strong>
                    </mat-checkbox>
                  </div>
                  <div class="permisos-grid">
                    @for (p of permisosByModule(mod); track p.key) {
                      <mat-checkbox
                        [checked]="isSelected(p.key)"
                        (change)="togglePermission(p.key, $event.checked)">
                        {{ p.action }}
                      </mat-checkbox>
                    }
                  </div>
                </div>
              }
            </mat-card-content>
          </mat-card>
        }

        <div class="form-actions">
          <a mat-stroked-button routerLink="/roles">Cancelar</a>
          <button mat-raised-button color="primary" type="submit" [disabled]="form.invalid || saving()">
            @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
            @else { <mat-icon>save</mat-icon> }
            {{ isEdit() ? 'Guardar cambios' : 'Crear rol' }}
          </button>
        </div>
      </form>
    }
  `,
  styles: [`
    .form-grid {
      display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));
      gap:16px;
    }
    .admin-notice {
      display:flex; align-items:center; gap:14px;
      background:#FFFBEB; border:1px solid #FDE68A; border-radius:10px;
      padding:14px 18px; margin-bottom:18px;
    }
    .admin-notice mat-icon { color:#D69E2E; font-size:32px; width:32px; height:32px; }
    .admin-notice p { margin:2px 0 0; font-size:13px; color:#92660E; }
    .permisos-header {
      display:flex; justify-content:space-between; align-items:center;
      flex-wrap:wrap; gap:10px;
    }
    .permisos-header h3 { margin:0; }
    .permisos-actions { display:flex; gap:8px; }
    .permisos-count { color:#1C4532; font-weight:600; font-size:13px; margin:6px 0 0; }
    .my-divider { margin:16px 0 !important; }
    .modulo-block { margin-bottom:18px; }
    .modulo-title {
      background:#F0FFF4; border-radius:8px; padding:8px 14px; margin-bottom:8px;
    }
    .permisos-grid {
      display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));
      gap:8px; padding-left:20px;
    }
  `],
})
export class RoleFormComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);

  isEdit = signal(false);
  loading = signal(true);
  saving = signal(false);
  isSystem = signal(false);
  isAdmin = signal(false);

  allPermisos = signal<PermisoItem[]>([]);
  selectedKeys = signal<string[]>([]);

  form = this.fb.group({
    name: ['', Validators.required],
    description: [''],
  });

  // Lista única de módulos en orden
  modules = computed(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of this.allPermisos()) {
      if (!seen.has(p.module)) { seen.add(p.module); result.push(p.module); }
    }
    return result;
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    // Cargar catálogo de permisos primero
    this.api.get<PermisoItem[]>('/roles/permissions').subscribe({
      next: (perms) => {
        this.allPermisos.set(perms);
        if (id) {
          this.isEdit.set(true);
          this.loadRole(id);
        } else {
          this.loading.set(false);
        }
      },
      error: () => this.loading.set(false),
    });
  }

  loadRole(id: string) {
    this.api.get<any>(`/roles/${id}`).subscribe({
      next: (role) => {
        this.form.patchValue({ name: role.name, description: role.description });
        this.isSystem.set(role.isSystem);
        this.isAdmin.set(role.isAdmin);
        this.selectedKeys.set(role.permissionKeys || []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  permisosByModule(mod: string): PermisoItem[] {
    return this.allPermisos().filter(p => p.module === mod);
  }

  isSelected(key: string): boolean {
    return this.selectedKeys().includes(key);
  }

  togglePermission(key: string, checked: boolean) {
    const cur = this.selectedKeys();
    if (checked && !cur.includes(key)) {
      this.selectedKeys.set([...cur, key]);
    } else if (!checked) {
      this.selectedKeys.set(cur.filter(k => k !== key));
    }
  }

  isModuleFullySelected(mod: string): boolean {
    const keys = this.permisosByModule(mod).map(p => p.key);
    return keys.length > 0 && keys.every(k => this.selectedKeys().includes(k));
  }

  isModulePartiallySelected(mod: string): boolean {
    const keys = this.permisosByModule(mod).map(p => p.key);
    const selected = keys.filter(k => this.selectedKeys().includes(k));
    return selected.length > 0 && selected.length < keys.length;
  }

  toggleModule(mod: string, checked: boolean) {
    const keys = this.permisosByModule(mod).map(p => p.key);
    const cur = new Set(this.selectedKeys());
    if (checked) keys.forEach(k => cur.add(k));
    else keys.forEach(k => cur.delete(k));
    this.selectedKeys.set([...cur]);
  }

  selectAll() {
    this.selectedKeys.set(this.allPermisos().map(p => p.key));
  }

  clearAll() {
    this.selectedKeys.set([]);
  }

  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const id = this.route.snapshot.paramMap.get('id');
    const body = {
      name: this.form.value.name!,
      description: this.form.value.description || '',
      permissionKeys: this.selectedKeys(),
    };

    const req = id
      ? this.api.put(`/roles/${id}`, body)
      : this.api.post('/roles', body);

    req.subscribe({
      next: () => {
        this.snackbar.open(this.isEdit() ? 'Rol actualizado' : 'Rol creado', 'OK', { duration: 3000 });
        this.router.navigate(['/roles']);
      },
      error: (err) => {
        this.snackbar.open(err.error?.message || 'Error al guardar', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }
}