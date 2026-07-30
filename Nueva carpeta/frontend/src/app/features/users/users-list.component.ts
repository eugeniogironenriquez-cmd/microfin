import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [
    CommonModule, DatePipe, RouterLink,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatChipsModule, MatTooltipModule,
    MatSlideToggleModule, MatSnackBarModule,
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
}