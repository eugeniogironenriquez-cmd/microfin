import { Component, OnInit, inject, signal, Inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService, AuthService } from '../../core/index';

// ── Diálogo para cambiar/reiniciar la contraseña de un usuario ──
@Component({
  selector: 'app-change-password-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule,
    MatIconModule, MatFormFieldModule, MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Cambiar contraseña</h2>
    <mat-dialog-content>
      <p class="usr">Usuario: <strong>{{ data.name }}</strong></p>

      <mat-form-field appearance="outline" class="full">
        <mat-label>Nueva contraseña</mat-label>
        <input matInput [type]="ver ? 'text' : 'password'"
               [(ngModel)]="password" autocomplete="new-password">
        <button mat-icon-button matSuffix type="button" (click)="ver = !ver">
          <mat-icon>{{ ver ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
        <mat-hint>Mínimo 8 caracteres</mat-hint>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full">
        <mat-label>Confirmar contraseña</mat-label>
        <input matInput [type]="ver ? 'text' : 'password'"
               [(ngModel)]="confirmar" autocomplete="new-password">
      </mat-form-field>

      @if (error()) {
        <p class="err">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="guardar()">
        Cambiar contraseña
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .usr { color: #4A5568; margin: 0 0 14px; }
    .full { width: 100%; }
    .err { color: #DC2626; font-size: 13px; margin: 4px 0 0; }
  `],
})
export class ChangePasswordDialog {
  password = '';
  confirmar = '';
  ver = false;
  error = signal('');

  constructor(
    private dialogRef: MatDialogRef<ChangePasswordDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { id: string; name: string },
  ) {}

  cancelar() {
    this.dialogRef.close(null);
  }

  guardar() {
    if (!this.password || this.password.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (this.password !== this.confirmar) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    // Devuelve la contraseña al componente padre, que llama al backend.
    this.dialogRef.close(this.password);
  }
}

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [
    CommonModule, DatePipe, RouterLink,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatChipsModule, MatTooltipModule,
    MatSlideToggleModule, MatSnackBarModule, MatDialogModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>manage_accounts</mat-icon> Usuarios</h1>
      <a mat-raised-button color="primary" routerLink="/users/new">
        <mat-icon>person_add</mat-icon> Nuevo usuario
      </a>
    </div>

    <mat-card>
      @if (loading()) {
        <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
      } @else if (users().length === 0) {
        <div class="empty-state">
          <mat-icon>manage_accounts</mat-icon>
          <p>Sin usuarios registrados</p>
        </div>
      } @else {
        <table mat-table [dataSource]="users()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Usuario</th>
            <td mat-cell *matCellDef="let r">
              <div class="client-name">{{ r.name }}</div>
              <div class="client-sub">{{ r.email }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>Rol</th>
            <td mat-cell *matCellDef="let r">
              <span class="badge badge-{{ (r.roleName || r.role) | lowercase }}">{{ r.roleName || r.role }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="lastLogin">
            <th mat-header-cell *matHeaderCellDef>Último acceso</th>
            <td mat-cell *matCellDef="let r">
              {{ r.lastLoginAt ? (r.lastLoginAt | date:'dd/MM/yyyy HH:mm') : '—' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="active">
            <th mat-header-cell *matHeaderCellDef>Activo</th>
            <td mat-cell *matCellDef="let r">
              <mat-slide-toggle [checked]="r.isActive"
                                [disabled]="togglingId() === r.id"
                                (change)="toggleActive(r)"></mat-slide-toggle>
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let r">
              <a mat-icon-button [routerLink]="['/users', r.id, 'edit']" matTooltip="Editar">
                <mat-icon>edit</mat-icon>
              </a>
              @if (auth.can('usuarios.crear')) {
                <button mat-icon-button (click)="cambiarPassword(r)" matTooltip="Cambiar contraseña">
                  <mat-icon>lock_reset</mat-icon>
                </button>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;"></tr>
        </table>
      }
    </mat-card>
  `,
})
export class UsersListComponent implements OnInit {
  private api     = inject(ApiService);
  private snackbar = inject(MatSnackBar);
  private dialog  = inject(MatDialog);
  readonly auth   = inject(AuthService);

  users   = signal<any[]>([]);
  loading = signal(true);
  togglingId = signal<string | null>(null);
  cols    = ['name', 'role', 'lastLogin', 'active', 'actions'];

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.get<any>('/users').subscribe({
      next: (r) => {
        if (Array.isArray(r)) {
          this.users.set(r);
        } else if (r?.data && Array.isArray(r.data)) {
          this.users.set(r.data);
        } else {
          this.users.set([]);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggleActive(user: any) {
    // Usar el endpoint dedicado PATCH /users/:id/toggle (el PUT no procesa isActive)
    this.togglingId.set(user.id);
    this.api.patch(`/users/${user.id}/toggle`, {}).subscribe({
      next: () => {
        this.snackbar.open('Usuario actualizado', 'OK', { duration: 2000 });
        this.togglingId.set(null);
        this.load();
      },
      error: () => {
        this.snackbar.open('Error al actualizar', 'Cerrar', { duration: 3000 });
        this.togglingId.set(null);
        this.load(); // recargar para revertir el toggle visual
      },
    });
  }

  // Abre el diálogo para cambiar la contraseña de un usuario y, si se confirma,
  // llama al endpoint del backend (PATCH /users/:id/reset-password).
  cambiarPassword(user: any) {
    const ref = this.dialog.open(ChangePasswordDialog, {
      width: '400px',
      data: { id: user.id, name: user.name },
    });
    ref.afterClosed().subscribe((nuevaPassword: string | null) => {
      if (!nuevaPassword) return; // canceló
      this.api
        .patch(`/users/${user.id}/reset-password`, { password: nuevaPassword })
        .subscribe({
          next: () => {
            this.snackbar.open('Contraseña actualizada', 'OK', { duration: 2500 });
          },
          error: (err) => {
            const msg =
              err?.status === 403
                ? 'No tienes permiso para cambiar contraseñas'
                : err?.error?.message || 'No se pudo cambiar la contraseña';
            this.snackbar.open(msg, 'Cerrar', { duration: 4000 });
          },
        });
    });
  }
}