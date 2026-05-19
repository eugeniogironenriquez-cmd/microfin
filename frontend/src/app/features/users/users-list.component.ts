// users-list.component.ts
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
import { ApiService, User, PagedResponse } from '../../core/index';

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
      } @else {
        <table mat-table [dataSource]="users()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Usuario</th>
            <td mat-cell *matCellDef="let r">
              <div>
                <div class="font-500">{{ r.name }}</div>
                <div class="text-muted text-xs">{{ r.email }}</div>
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>Rol</th>
            <td mat-cell *matCellDef="let r">
              <span class="role-chip role-{{ r.role | lowercase }}">{{ r.role }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="lastLogin">
            <th mat-header-cell *matHeaderCellDef>Último acceso</th>
            <td mat-cell *matCellDef="let r">{{ r.lastLoginAt | date:'dd/MM/yyyy HH:mm' }}</td>
          </ng-container>
          <ng-container matColumnDef="active">
            <th mat-header-cell *matHeaderCellDef>Activo</th>
            <td mat-cell *matCellDef="let r">
              <mat-slide-toggle [checked]="r.isActive" (change)="toggleActive(r)"></mat-slide-toggle>
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
  `
})
export class UsersListComponent implements OnInit {
  private api = inject(ApiService);
  private snackbar = inject(MatSnackBar);
  users = signal<User[]>([]);
  loading = signal(true);
  cols = ['name', 'role', 'lastLogin', 'active', 'actions'];

  ngOnInit() {
    this.api.get<PagedResponse<User>>('/users').subscribe({
      next: (r) => { this.users.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  toggleActive(user: User) {
    this.api.put(`/users/${user.id}`, { isActive: !(user as any).isActive }).subscribe({
      next: () => this.snackbar.open('Usuario actualizado', 'OK', { duration: 2000 }),
    });
  }
}
