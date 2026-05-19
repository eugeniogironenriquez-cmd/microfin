import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService, AuthService, Loan, PagedResponse } from '../../core/index';
import { PdfDownloadService } from '../../core/pdf-download.service';

@Component({
  selector: 'app-disbursements',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, RouterLink, ReactiveFormsModule,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatInputModule, MatFormFieldModule, MatSelectModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatTooltipModule, MatTabsModule, MatPaginatorModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>payments</mat-icon> Desembolsos</h1>
    </div>

    <mat-tab-group>
      <!-- PENDIENTES -->
      <mat-tab label="Pendientes de desembolso">
        <div class="tab-content">
          <mat-card class="filters-card">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Buscar cliente</mat-label>
              <input matInput [formControl]="searchCtrl" placeholder="Nombre o teléfono">
              <mat-icon matPrefix>search</mat-icon>
            </mat-form-field>
          </mat-card>

          @if (loadingPending()) {
            <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
          } @else if (pending().length === 0) {
            <div class="empty-state">
              <mat-icon>check_circle</mat-icon>
              <p>Sin préstamos pendientes de desembolso</p>
            </div>
          } @else {
            @for (loan of pending(); track loan.id) {
              <mat-card class="loan-card">
                <mat-card-content>
                  <div class="loan-header">
                    <div class="loan-info">
                      <div class="client-name">{{ loan.customer?.fullName }}</div>
                      <div class="client-sub">{{ loan.customer?.phone }} — {{ loan.loanType?.name }}</div>
                    </div>
                    <div class="loan-amount">
                      {{ loan.principalAmount | currency:'MXN' }}
                      <div class="loan-sub">Cuota: {{ loan.periodicPayment | currency:'MXN' }}</div>
                    </div>
                    <div class="loan-meta">
                      <div class="meta-item">
                        <span class="meta-label">Plazo</span>
                        <span>{{ loan.termWeeks }} sem.</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Frecuencia</span>
                        <span>{{ loan.frequency }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Autorizado</span>
                        <span>{{ loan.authorizedAt | date:'dd/MM/yyyy' }}</span>
                      </div>
                    </div>
                    <div class="loan-actions">
                      <a mat-stroked-button [routerLink]="['/loans', loan.id]">
                        <mat-icon>visibility</mat-icon> Ver
                      </a>
                      <button mat-raised-button color="primary"
                              (click)="openDisburseDialog(loan)"
                              [disabled]="disbursing() === loan.id">
                        @if (disbursing() === loan.id) {
                          <mat-spinner diameter="18"></mat-spinner>
                        } @else {
                          <mat-icon>payments</mat-icon>
                        }
                        Desembolsar
                      </button>
                    </div>
                  </div>
                </mat-card-content>
              </mat-card>
            }

            <mat-paginator
              [length]="pendingTotal()"
              [pageSize]="pageSize"
              [pageSizeOptions]="[10,20,50]"
              (page)="onPendingPage($event)">
            </mat-paginator>
          }
        </div>
      </mat-tab>

      <!-- HISTORIAL -->
      <mat-tab label="Historial de desembolsos">
        <div class="tab-content">
          <mat-card class="filters-card">
            <div class="date-filters">
              <mat-form-field appearance="outline">
                <mat-label>Desde</mat-label>
                <input matInput type="date" [formControl]="startDateCtrl">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Hasta</mat-label>
                <input matInput type="date" [formControl]="endDateCtrl">
              </mat-form-field>
              <button mat-raised-button color="primary" (click)="loadHistory()">
                <mat-icon>search</mat-icon> Buscar
              </button>
            </div>
          </mat-card>

          @if (loadingHistory()) {
            <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
          } @else {
            <mat-card>
              <table mat-table [dataSource]="history()">
                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>Fecha desembolso</th>
                  <td mat-cell *matCellDef="let r">{{ r.disbursedAt | date:'dd/MM/yyyy' }}</td>
                </ng-container>
                <ng-container matColumnDef="customer">
                  <th mat-header-cell *matHeaderCellDef>Cliente</th>
                  <td mat-cell *matCellDef="let r">
                    <div class="client-name">{{ r.customer?.fullName }}</div>
                    <div class="client-sub">{{ r.customer?.phone }}</div>
                  </td>
                </ng-container>
                <ng-container matColumnDef="type">
                  <th mat-header-cell *matHeaderCellDef>Tipo</th>
                  <td mat-cell *matCellDef="let r">{{ r.loanType?.name }}</td>
                </ng-container>
                <ng-container matColumnDef="amount">
                  <th mat-header-cell *matHeaderCellDef>Monto</th>
                  <td mat-cell *matCellDef="let r">
                    <strong>{{ r.principalAmount | currency:'MXN' }}</strong>
                  </td>
                </ng-container>
                <ng-container matColumnDef="method">
                  <th mat-header-cell *matHeaderCellDef>Forma</th>
                  <td mat-cell *matCellDef="let r">{{ r.disbursementMethod || '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Estado</th>
                  <td mat-cell *matCellDef="let r">
                    <span class="badge badge-{{ r.status | lowercase }}">{{ r.status }}</span>
                  </td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let r">
                    <a mat-icon-button [routerLink]="['/loans', r.id]" matTooltip="Ver detalle">
                      <mat-icon>visibility</mat-icon>
                    </a>
                    <a mat-icon-button [href]="'/api/v1/loans/' + r.id + '/pdf'" target="_blank"
                       matTooltip="Descargar contrato">
                      <mat-icon>picture_as_pdf</mat-icon>
                    </a>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="historyCols"></tr>
                <tr mat-row *matRowDef="let row; columns: historyCols;"></tr>
              </table>
              <mat-paginator [length]="historyTotal()" [pageSize]="pageSize"
                             [pageSizeOptions]="[10,20,50]" (page)="onHistoryPage($event)">
              </mat-paginator>
            </mat-card>
          }
        </div>
      </mat-tab>
    </mat-tab-group>

    <!-- DIALOG de desembolso -->
    @if (selectedLoan()) {
      <div class="dialog-overlay" (click)="closeDialog()">
        <mat-card class="dialog-card" (click)="$event.stopPropagation()">
          <mat-card-header>
            <mat-card-title>Confirmar desembolso</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="dialog-info">
              <div class="info-row"><span>Cliente</span><strong>{{ selectedLoan()!.customer?.fullName }}</strong></div>
              <div class="info-row"><span>Monto</span><strong>{{ selectedLoan()!.principalAmount | currency:'MXN' }}</strong></div>
              <div class="info-row"><span>Cuota</span><strong>{{ selectedLoan()!.periodicPayment | currency:'MXN' }}</strong></div>
              <div class="info-row"><span>Plazo</span><strong>{{ selectedLoan()!.termWeeks }} semanas ({{ selectedLoan()!.frequency }})</strong></div>
            </div>

            <mat-form-field appearance="outline" class="w-full" style="margin-top:16px">
              <mat-label>Forma de entrega *</mat-label>
              <mat-select [(ngModel)]="disbursementMethod">
                <mat-option value="EFECTIVO">Efectivo en caja</mat-option>
                <mat-option value="TRANSFERENCIA">Transferencia bancaria</mat-option>
                <mat-option value="CHEQUE">Cheque</mat-option>
              </mat-select>
            </mat-form-field>

            <div class="alert-box warning" style="margin-top:12px">
              <mat-icon>warning</mat-icon>
              <span>Esta acción generará el calendario de pagos y no se puede deshacer.</span>
            </div>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-stroked-button (click)="closeDialog()">Cancelar</button>
            <button mat-raised-button color="primary"
                    [disabled]="!disbursementMethod || disbursing() === selectedLoan()!.id"
                    (click)="confirmDisburse()">
              <mat-icon>payments</mat-icon> Confirmar desembolso
            </button>
          </mat-card-actions>
        </mat-card>
      </div>
    }
  `
})
export class DisbursementsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);
  private snackbar = inject(MatSnackBar);
  private pdfSvc = inject(PdfDownloadService);

  pending = signal<Loan[]>([]);
  pendingTotal = signal(0);
  history = signal<Loan[]>([]);
  historyTotal = signal(0);
  loadingPending = signal(true);
  loadingHistory = signal(false);
  disbursing = signal<string | null>(null);
  selectedLoan = signal<Loan | null>(null);
  disbursementMethod = 'EFECTIVO';

  pageSize = 10;
  pendingPage = 0;
  historyPage = 0;

  searchCtrl = new FormControl('');
  startDateCtrl = new FormControl('');
  endDateCtrl = new FormControl('');

  historyCols = ['date', 'customer', 'type', 'amount', 'method', 'status', 'actions'];

  ngOnInit() {
    this.loadPending();
    this.searchCtrl.valueChanges.pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => { this.pendingPage = 0; this.loadPending(); });
  }

  loadPending() {
    this.loadingPending.set(true);
    this.api.get<any>('/disbursements/pending', {
      page: this.pendingPage + 1,
      limit: this.pageSize,
      search: this.searchCtrl.value || undefined,
    }).subscribe({
      next: (r) => { this.pending.set(r.data); this.pendingTotal.set(r.total); this.loadingPending.set(false); },
      error: () => this.loadingPending.set(false),
    });
  }

  loadHistory() {
    this.loadingHistory.set(true);
    this.api.get<any>('/disbursements/history', {
      page: this.historyPage + 1,
      limit: this.pageSize,
      startDate: this.startDateCtrl.value || undefined,
      endDate: this.endDateCtrl.value || undefined,
    }).subscribe({
      next: (r) => { this.history.set(r.data); this.historyTotal.set(r.total); this.loadingHistory.set(false); },
      error: () => this.loadingHistory.set(false),
    });
  }

  openDisburseDialog(loan: Loan) { this.selectedLoan.set(loan); this.disbursementMethod = 'EFECTIVO'; }
  closeDialog() { this.selectedLoan.set(null); }

  confirmDisburse() {
    const loan = this.selectedLoan();
    if (!loan || !this.disbursementMethod) return;
    this.disbursing.set(loan.id);
    this.api.post<any>(`/disbursements/${loan.id}`, { disbursementMethod: this.disbursementMethod }).subscribe({
      next: () => {
        this.snackbar.open('Desembolso registrado correctamente', 'OK', { duration: 4000 });
        this.disbursing.set(null);
        const loanId = loan.id;
        this.closeDialog();
        this.loadPending();
        // Abrir contrato PDF automáticamente
        setTimeout(() => this.pdfSvc.open('/loans/' + loanId + '/pdf'), 1000);
      },
      error: (err) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error al desembolsar', 'Cerrar', { duration: 5000 });
        this.disbursing.set(null);
      },
    });
  }

  onPendingPage(e: PageEvent) { this.pendingPage = e.pageIndex; this.pageSize = e.pageSize; this.loadPending(); }
  onHistoryPage(e: PageEvent) { this.historyPage = e.pageIndex; this.pageSize = e.pageSize; this.loadHistory(); }
}
