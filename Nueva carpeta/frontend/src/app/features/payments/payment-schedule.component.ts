import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, PaymentSchedule } from '../../core/index';

@Component({
  selector: 'app-payment-schedule',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, RouterLink,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>calendar_month</mat-icon> Tabla de amortización</h1>
      <a mat-stroked-button [routerLink]="['/loans', loanId()]">
        <mat-icon>arrow_back</mat-icon> Ver préstamo
      </a>
    </div>
    <mat-card>
      @if (loading()) { <div class="loading-overlay"><mat-spinner></mat-spinner></div> }
      @else {
        <table mat-table [dataSource]="schedule()">
          <ng-container matColumnDef="period">
            <th mat-header-cell *matHeaderCellDef>#</th>
            <td mat-cell *matCellDef="let r">{{ r.periodNumber }}</td>
          </ng-container>
          <ng-container matColumnDef="dueDate">
            <th mat-header-cell *matHeaderCellDef>Fecha vencimiento</th>
            <td mat-cell *matCellDef="let r">{{ r.dueDate | date:'dd/MM/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="total">
            <th mat-header-cell *matHeaderCellDef>Cuota</th>
            <td mat-cell *matCellDef="let r">{{ r.totalDue | currency:'MXN' }}</td>
          </ng-container>
          <ng-container matColumnDef="principal">
            <th mat-header-cell *matHeaderCellDef>Capital</th>
            <td mat-cell *matCellDef="let r">{{ r.principalDue | currency:'MXN' }}</td>
          </ng-container>
          <ng-container matColumnDef="interest">
            <th mat-header-cell *matHeaderCellDef>Interés</th>
            <td mat-cell *matCellDef="let r">{{ r.interestDue | currency:'MXN' }}</td>
          </ng-container>
          <ng-container matColumnDef="lateInterest">
            <th mat-header-cell *matHeaderCellDef>Moratorio</th>
            <td mat-cell *matCellDef="let r" [style.color]="r.estimatedLateInterest > 0 ? '#e65100' : ''">
              {{ r.estimatedLateInterest | currency:'MXN' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="balance">
            <th mat-header-cell *matHeaderCellDef>Saldo pendiente</th>
            <td mat-cell *matCellDef="let r">{{ r.balanceDue | currency:'MXN' }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let r">
              <span class="status-badge status-{{ r.status | lowercase }}">{{ r.status }}</span>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;" [class.paid-row]="row.status === 'PAGADO'"></tr>
        </table>
      }
    </mat-card>
  `
})
export class PaymentScheduleComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  loanId = signal('');
  schedule = signal<PaymentSchedule[]>([]);
  loading = signal(true);
  cols = ['period', 'dueDate', 'total', 'principal', 'interest', 'lateInterest', 'balance', 'status'];

  ngOnInit() {
    this.loanId.set(this.route.snapshot.paramMap.get('loanId')!);
    this.api.get<PaymentSchedule[]>(`/payments/schedule/${this.loanId()}`).subscribe({
      next: (s) => { this.schedule.set(s); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
