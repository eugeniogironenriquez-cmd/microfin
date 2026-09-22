import { Component, OnInit, inject, signal, Inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  MatDialog, MatDialogModule, MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService } from '../../core/index';

// ── Diálogo para dar de alta una sucursal + su usuario administrador ──
@Component({
  selector: 'app-sucursal-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule,
    MatIconModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>Nueva sucursal</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="suc-form">
        <h3 class="sec">Datos de la sucursal</h3>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Nombre de la sucursal *</mat-label>
          <input matInput formControlName="name">
        </mat-form-field>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Código</mat-label>
            <input matInput formControlName="code" placeholder="Ej. SUC-02">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Teléfono</mat-label>
            <input matInput formControlName="phone">
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Dirección</mat-label>
          <input matInput formControlName="address">
        </mat-form-field>

        <div class="admin-toggle">
          <mat-slide-toggle formControlName="crearAdmin">
            Crear usuario administrador para esta sucursal
          </mat-slide-toggle>
        </div>

        @if (form.value.crearAdmin) {
          <h3 class="sec">Usuario administrador</h3>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Nombre del administrador *</mat-label>
            <input matInput formControlName="adminName">
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Correo *</mat-label>
            <input matInput type="email" formControlName="adminEmail">
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Contraseña *</mat-label>
            <input matInput [type]="verPass ? 'text' : 'password'" formControlName="adminPassword">
            <button mat-icon-button matSuffix type="button" (click)="verPass = !verPass">
              <mat-icon>{{ verPass ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            <mat-hint>Mínimo 8 caracteres</mat-hint>
          </mat-form-field>
        }

        @if (error()) { <p class="err">{{ error() }}</p> }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="guardar()" [disabled]="saving()">
        @if (saving()) { Guardando... } @else { Crear sucursal }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .suc-form { display:flex; flex-direction:column; min-width:420px; }
    .sec { margin:8px 0 4px; font-size:14px; color:#2795F5; font-weight:600; }
    .full { width:100%; }
    .row { display:flex; gap:12px; }
    .row mat-form-field { flex:1; }
    .admin-toggle { margin:8px 0 4px; }
    .err { color:#DC2626; font-size:13px; margin:4px 0 0; }
  `],
})
export class SucursalDialog {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  saving = signal(false);
  error = signal('');
  verPass = false;

  form = this.fb.group({
    name: ['', Validators.required],
    code: [''],
    phone: [''],
    address: [''],
    crearAdmin: [true],
    adminName: [''],
    adminEmail: [''],
    adminPassword: [''],
  });

  constructor(private dialogRef: MatDialogRef<SucursalDialog>) {}

  cancelar() { this.dialogRef.close(null); }

  guardar() {
    const v = this.form.value;
    if (!v.name) { this.error.set('El nombre de la sucursal es obligatorio.'); return; }

    const body: any = {
      name: v.name, code: v.code, phone: v.phone, address: v.address,
    };

    if (v.crearAdmin) {
      if (!v.adminName || !v.adminEmail) {
        this.error.set('Completa el nombre y correo del administrador.'); return;
      }
      if (!v.adminPassword || v.adminPassword.length < 8) {
        this.error.set('La contraseña del administrador debe tener al menos 8 caracteres.'); return;
      }
      body.admin = { name: v.adminName, email: v.adminEmail, password: v.adminPassword };
    }

    this.saving.set(true);
    this.api.post<any>('/sucursales', body).subscribe({
      next: (res) => { this.saving.set(false); this.dialogRef.close(res || true); },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err.error?.message || 'No se pudo crear la sucursal.');
      },
    });
  }
}

// ── Pantalla principal: lista de sucursales ──
@Component({
  selector: 'app-sucursales',
  standalone: true,
  imports: [
    CommonModule, DatePipe, MatCardModule, MatTableModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, MatChipsModule, MatTooltipModule,
    MatSnackBarModule, MatDialogModule,
  ],
  template: `
    <div class="page">
      <div class="header">
        <h1><mat-icon>store</mat-icon> Sucursales</h1>
        <button mat-raised-button color="primary" (click)="nuevaSucursal()">
          <mat-icon>add</mat-icon> Nueva sucursal
        </button>
      </div>

      <mat-card>
        <mat-card-content>
          @if (loading()) {
            <div class="loading"><mat-spinner diameter="36"></mat-spinner></div>
          } @else if (sucursales().length === 0) {
            <div class="empty">
              <mat-icon>store</mat-icon>
              <p>No hay sucursales registradas</p>
            </div>
          } @else {
            <table mat-table [dataSource]="sucursales()">
              <ng-container matColumnDef="nombre">
                <th mat-header-cell *matHeaderCellDef>Nombre</th>
                <td mat-cell *matCellDef="let s">
                  {{ s.name }}
                  @if (s.isMatriz) { <span class="badge-matriz">MATRIZ</span> }
                </td>
              </ng-container>
              <ng-container matColumnDef="codigo">
                <th mat-header-cell *matHeaderCellDef>Código</th>
                <td mat-cell *matCellDef="let s">{{ s.code || '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="telefono">
                <th mat-header-cell *matHeaderCellDef>Teléfono</th>
                <td mat-cell *matCellDef="let s">{{ s.phone || '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="estado">
                <th mat-header-cell *matHeaderCellDef>Estado</th>
                <td mat-cell *matCellDef="let s">
                  <span class="badge" [class.activo]="s.isActive" [class.inactivo]="!s.isActive">
                    {{ s.isActive ? 'Activa' : 'Inactiva' }}
                  </span>
                </td>
              </ng-container>
              <ng-container matColumnDef="acciones">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let s">
                  @if (!s.isMatriz) {
                    <button mat-icon-button (click)="toggle(s)"
                            [matTooltip]="s.isActive ? 'Desactivar' : 'Activar'">
                      <mat-icon>{{ s.isActive ? 'toggle_on' : 'toggle_off' }}</mat-icon>
                    </button>
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="cols"></tr>
              <tr mat-row *matRowDef="let row; columns: cols"></tr>
            </table>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { padding:16px; }
    .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .header h1 { display:flex; align-items:center; gap:8px; font-size:22px; color:#1C4532; margin:0; }
    .loading, .empty { display:flex; flex-direction:column; align-items:center; padding:40px; color:#A0AEC0; }
    .empty mat-icon { font-size:48px; width:48px; height:48px; margin-bottom:8px; }
    table { width:100%; }
    .badge-matriz { margin-left:8px; padding:2px 8px; border-radius:10px; background:#DBEAFE; color:#1E40AF; font-size:11px; font-weight:700; }
    .badge { padding:2px 10px; border-radius:10px; font-size:12px; font-weight:600; }
    .badge.activo { background:#DCFCE7; color:#166534; }
    .badge.inactivo { background:#FEE2E2; color:#991B1B; }
  `],
})
export class SucursalesComponent implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snackbar = inject(MatSnackBar);

  sucursales = signal<any[]>([]);
  loading = signal(true);
  cols = ['nombre', 'codigo', 'telefono', 'estado', 'acciones'];

  ngOnInit() { this.cargar(); }

  cargar() {
    this.loading.set(true);
    this.api.get<any>('/sucursales').subscribe({
      next: (data) => {
        this.sucursales.set(Array.isArray(data) ? data : data?.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  nuevaSucursal() {
    const ref = this.dialog.open(SucursalDialog, { width: '520px' });
    ref.afterClosed().subscribe((res) => {
      if (res) {
        this.snackbar.open('Sucursal creada correctamente', 'OK', { duration: 3000 });
        this.cargar();
      }
    });
  }

  toggle(s: any) {
    this.api.delete<any>(`/sucursales/${s.id}`).subscribe({
      next: () => this.cargar(),
      error: (err) => this.snackbar.open(err.error?.message || 'Error', 'Cerrar', { duration: 4000 }),
    });
  }
}
