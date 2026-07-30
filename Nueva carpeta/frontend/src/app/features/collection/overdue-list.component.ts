// overdue-list.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-overdue-list',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="page-header">
      <h1><mat-icon>warning</mat-icon> Cartera vencida</h1>
      <a mat-stroked-button routerLink="/collection"><mat-icon>arrow_back</mat-icon> Cobranza</a>
    </div>
    <p class="text-muted">Vista detallada de cartera vencida con filtros por cobrador y fechas.</p>
  `,
})
export class OverdueListComponent {}
