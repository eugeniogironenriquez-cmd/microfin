import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-roles-list',
  standalone: true,
  imports: [
    CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatChipsModule, MatProgressSpinnerModule, MatTooltipModule,
    MatSnackBarModule, MatDialogModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>admin_panel_settings</mat-icon> Roles y permisos</h1>
      <a mat-raised-button color="primary" routerLink="/roles/new">
        <mat-icon>add</mat-icon> Nuevo rol
      </a>
    </div>

    <mat-card>
      @if (loading()) {
        <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
      } @else {
        <table mat-table [dataSource]="roles()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Rol</th>
            <td mat-cell *matCellDef="let r">
              <div class="role-cell">
                <span class="role-name">
                  {{ r.name }}
                  @if (r.isAdmin) {
                    <mat-icon class="admin-star" matTooltip="Acceso total">stars</mat-icon>
                  }
                </span>
                <span class="role-desc">{{ r.description || '—' }}</span>
              </div>
            </td>
          </ng-container>

          <ng-container matColumnDef="type">
            <th mat-header-cell *matHeaderCellDef>Tipo</th>
            <td mat-cell *matCellDef="let r">
              @if (r.isSystem) {
                <span class="badge badge-system">Sistema</span>
              } @else {
                <span class="badge badge-custom">Personalizado</span>
              }
            </td>
          </ng-container>

          <ng-container matColumnDef="permissions">
            <th mat-header-cell *matHeaderCellDef>Permisos</th>
            <td mat-cell *matCellDef="let r">
              @if (r.isAdmin) {
                <span class="badge badge-all">TODOS</span>
              } @else {
                <span class="perm-count">{{ r.permissionCount }} permisos</span>
              }
            </td>
          </ng-container>

          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let r">
              <span class="badge" [class.badge-active]="r.isActive" [class.badge-inactive]="!r.isActive">
                {{ r.isActive ? 'Activo' : 'Inactivo' }}
              </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let r">
              <button mat-icon-button [routerLink]="['/roles', r.id, 'edit']" matTooltip="Editar permisos">
                <mat-icon>edit</mat-icon>
              </button>
              @if (!r.isSystem) {
                <button mat-icon-button color="warn" (click)="remove(r)" matTooltip="Eliminar">
                  <mat-icon>delete</mat-icon>
                </button>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;"></tr>
        </table>

        @if (roles().length === 0) {
          <div class="empty-state">
            <mat-icon>admin_panel_settings</mat-icon>
            <p>No hay roles registrados</p>
          </div>
        }
      }
    </mat-card>
  `,
  styles: [`
    .role-cell { display:flex; flex-direction:column; gap:2px; }
    .role-name { font-weight:600; display:flex; align-items:center; gap:6px; }
    .role-desc { font-size:12px; color:#718096; }
    .admin-star { color:#D69E2E; font-size:18px; width:18px; height:18px; }
    .perm-count { color:#4A5568; font-size:13px; }
    .badge {
      padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600;
    }
    .badge-system   { background:#E6FFFA; color:#234E52; }
    .badge-custom   { background:#EBF8FF; color:#2A4365; }
    .badge-all      { background:#1C4532; color:#fff; }
    .badge-active   { background:#F0FFF4; color:#22543D; }
    .badge-inactive { background:#FFF5F5; color:#822727; }
  `],
})
export class RolesListComponent implements OnInit {
  private api = inject(ApiService);
  private snackbar = inject(MatSnackBar);

  roles = signal<any[]>([]);
  loading = signal(true);
  cols = ['name', 'type', 'permissions', 'status', 'actions'];

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.get<any[]>('/roles').subscribe({
      next: (data) => { this.roles.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  remove(role: any) {
    if (!confirm(`¿Eliminar el rol "${role.name}"? Esta acción no se puede deshacer.`)) return;
    this.api.delete(`/roles/${role.id}`).subscribe({
      next: () => {
        this.snackbar.open('Rol eliminado', 'OK', { duration: 3000 });
        this.load();
      },
      error: (err) => {
        this.snackbar.open(err.error?.message || 'No se pudo eliminar', 'Cerrar', { duration: 5000 });
      },
    });
  }
}