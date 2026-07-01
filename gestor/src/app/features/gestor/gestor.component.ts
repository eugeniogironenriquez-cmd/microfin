import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { GestorService } from '../../core/gestor.service';
import { CreditoSemaforo } from '../../core/models';

@Component({
  selector: 'app-gestor',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatIconModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1><mat-icon>support_agent</mat-icon> Gestión de cobranza</h1>
        <button mat-stroked-button (click)="cargar()">
          <mat-icon>refresh</mat-icon> Actualizar
        </button>
      </div>

      <p class="intro">
        Créditos en estado crítico (más de 5 cuotas vencidas). Contacta al cliente
        y aplica una promesa de pago, convenio o reestructura según el caso.
      </p>

      <mat-form-field appearance="outline" class="search">
        <mat-label>Buscar cliente</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [(ngModel)]="search" (keyup.enter)="cargar()">
        @if (search) {
          <button mat-icon-button matSuffix (click)="search=''; cargar()"><mat-icon>close</mat-icon></button>
        }
      </mat-form-field>

      @if (loading()) {
        <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (creditos().length === 0) {
        <mat-card class="empty-card">
          <mat-icon>check_circle</mat-icon>
          <p>No hay créditos en estado crítico. ¡Buen trabajo!</p>
        </mat-card>
      } @else {
        <div class="cards">
          @for (c of creditos(); track c.loanId) {
            <mat-card class="rojo-card">
              <div class="rc-head">
                <span class="dot dot-rojo"></span>
                <div class="rc-name">{{ c.customerName }}</div>
                <span class="nivel-chip nivel-rojo">{{ c.cuotasVencidas }} vencidas</span>
              </div>
              <div class="rc-body">
                @if (c.phone) {
                  <a class="rc-line" [href]="'tel:' + c.phone">
                    <mat-icon>call</mat-icon> {{ c.phone }}
                  </a>
                }
                @if (c.saldoPendiente != null) {
                  <div class="rc-line">
                    <mat-icon>account_balance_wallet</mat-icon>
                    Saldo: {{ c.saldoPendiente | currency:'MXN':'symbol':'1.2-2' }}
                  </div>
                }
              </div>
              <div class="rc-actions">
                <button mat-flat-button color="primary" (click)="gestionar(c)">
                  Gestionar <mat-icon>chevron_right</mat-icon>
                </button>
              </div>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .intro { color: var(--gray-600); font-size: 14px; max-width: 640px; margin: 0 0 16px; }
    .search { width: 100%; max-width: 420px; margin-bottom: 12px; }
    .center { display: flex; justify-content: center; padding: 48px; }
    .empty-card {
      text-align: center; padding: 40px; color: var(--verde);
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .empty-card mat-icon { font-size: 48px; width: 48px; height: 48px; }
    .cards {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 14px;
    }
    .rojo-card { border-left: 4px solid var(--rojo); padding: 16px; }
    .rc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .rc-name { font-weight: 600; flex: 1; }
    .rc-body { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
    .rc-line {
      display: flex; align-items: center; gap: 8px;
      color: var(--gray-600); font-size: 14px; text-decoration: none;
    }
    .rc-line mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--blue-500); }
    a.rc-line:hover { color: var(--blue-600); }
    .rc-actions { text-align: right; }
  `],
})
export class GestorComponent implements OnInit {
  private gestor = inject(GestorService);
  private router = inject(Router);

  loading = signal(true);
  creditos = signal<CreditoSemaforo[]>([]);
  search = '';

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.gestor.getGestor(this.search || undefined).subscribe({
      next: (res) => {
        this.creditos.set(res.creditos);
        this.loading.set(false);
      },
      error: () => {
        this.creditos.set([]);
        this.loading.set(false);
      },
    });
  }

  gestionar(c: CreditoSemaforo) {
    this.router.navigate(['/credito', c.loanId], { state: { credito: c } });
  }
}
