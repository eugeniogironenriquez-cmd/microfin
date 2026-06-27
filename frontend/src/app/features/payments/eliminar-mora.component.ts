import { Component, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { ApiService, Loan } from '../../core/index';

@Component({
  selector: 'app-eliminar-mora',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatTableModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>gavel</mat-icon> Eliminar mora</h1>
      <a mat-stroked-button routerLink="/loans"><mat-icon>arrow_back</mat-icon> Préstamos</a>
    </div>

    <div class="alert-box warning" style="margin-bottom:16px">
      <mat-icon>info</mat-icon>
      <span>Busca un crédito para ver sus cuotas con mora. Solo se puede eliminar la mora
            de cuotas que <strong>ya están pagadas</strong>. Esta acción no se puede deshacer.</span>
    </div>

    <!-- Búsqueda -->
    <mat-card>
      <mat-card-content>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Buscar cliente por nombre, CURP o teléfono</mat-label>
          <input matInput [value]="searchTerm()" (input)="onSearch($event)"
                 placeholder="Ej: Juan García">
          <mat-icon matPrefix>search</mat-icon>
          @if (searchLoading()) { <mat-spinner matSuffix diameter="18"></mat-spinner> }
        </mat-form-field>

        @for (loan of searchResults(); track loan.id) {
          <div class="loan-result" [class.selected]="selectedLoan()?.id === loan.id"
               (click)="selectLoan(loan)">
            <div class="loan-name">{{ loan.customer?.fullName }}</div>
            <div class="loan-meta">
              {{ loan.principalAmount | currency:'MXN' }} ·
              <span class="badge badge-{{ loan.status | lowercase }}">{{ loan.status }}</span>
            </div>
          </div>
        }
      </mat-card-content>
    </mat-card>

    <!-- Cuotas con mora -->
    @if (selectedLoan()) {
      <mat-card class="mt-16">
        <mat-card-header>
          <mat-card-title>Cuotas con mora</mat-card-title>
          <mat-card-subtitle>
            {{ data()?.loan?.customerName }} · Total mora: {{ data()?.totalMora | currency:'MXN' }}
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (loading()) {
            <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
          } @else if (cuotas().length === 0) {
            <div class="empty-state">
              <mat-icon>check_circle</mat-icon>
              <p>Este crédito no tiene cuotas con mora registrada.</p>
            </div>
          } @else {
            <table mat-table [dataSource]="cuotas()" class="w-full">
              <ng-container matColumnDef="periodo">
                <th mat-header-cell *matHeaderCellDef>Cuota</th>
                <td mat-cell *matCellDef="let c">{{ c.periodo }}</td>
              </ng-container>
              <ng-container matColumnDef="vence">
                <th mat-header-cell *matHeaderCellDef>Vence</th>
                <td mat-cell *matCellDef="let c">{{ c.vence | date:'dd/MM/yy':'UTC' }}</td>
              </ng-container>
              <ng-container matColumnDef="estatus">
                <th mat-header-cell *matHeaderCellDef>Estado</th>
                <td mat-cell *matCellDef="let c">
                  <span class="badge badge-{{ c.estatus | lowercase }}">{{ c.estatus }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="mora">
                <th mat-header-cell *matHeaderCellDef>Mora</th>
                <td mat-cell *matCellDef="let c">{{ c.moraGenerada | currency:'MXN' }}</td>
              </ng-container>
              <ng-container matColumnDef="accion">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let c">
                  @if (c.puedeEliminar) {
                    <button mat-stroked-button color="warn" (click)="eliminar(c)"
                            [disabled]="deletingId() === c.scheduleId">
                      @if (deletingId() === c.scheduleId) { <mat-spinner diameter="18"></mat-spinner> }
                      @else { <mat-icon>delete</mat-icon> }
                      Eliminar
                    </button>
                  } @else {
                    <span class="no-elim" matTooltip="Solo se puede eliminar la mora de cuotas pagadas">
                      No pagada
                    </span>
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="cols"></tr>
              <tr mat-row *matRowDef="let row; columns: cols;"
                  [class.paid-row]="row.pagada"></tr>
            </table>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: [`
    .w-full { width:100%; }
    .mt-16 { margin-top:16px; }
    .loan-result {
      padding:10px 12px; border-radius:8px; cursor:pointer;
      border:1px solid #E2E8F0; margin-bottom:6px; transition:.15s;
    }
    .loan-result:hover { border-color:#1C4532; background:#F0FFF4; }
    .loan-result.selected { border-color:#1C4532; background:#F0FFF4; box-shadow:0 0 0 2px #1C4532; }
    .loan-name { font-weight:600; font-size:14px; }
    .loan-meta { font-size:12px; color:#718096; margin-top:2px; }
    .loading-overlay { display:flex; justify-content:center; padding:32px; }
    .empty-state { text-align:center; padding:32px; color:#718096; }
    .empty-state mat-icon { font-size:42px; width:42px; height:42px; color:#16A34A; }
    .no-elim { font-size:12px; color:#A0AEC0; font-style:italic; }
    .paid-row { background:#F7FAFC; }
  `],
})
export class EliminarMoraComponent {
  private api      = inject(ApiService);
  private snackbar = inject(MatSnackBar);

  searchTerm    = signal('');
  searchResults = signal<Loan[]>([]);
  searchLoading = signal(false);
  selectedLoan  = signal<Loan | null>(null);
  data          = signal<any>(null);
  loading       = signal(false);
  deletingId    = signal<string | null>(null);

  cols = ['periodo', 'vence', 'estatus', 'mora', 'accion'];
  cuotas = signal<any[]>([]);

  private searchSubject = new Subject<string>();

  constructor() {
    this.searchSubject.pipe(debounceTime(400), distinctUntilChanged()).subscribe((term) => {
      if (!term || term.length < 3) { this.searchResults.set([]); return; }
      this.searchLoading.set(true);
      this.api.get<any>('/loans', { search: term, limit: 10 }).subscribe({
        next: (r) => {
          const all = Array.isArray(r) ? r : r?.data ?? [];
          this.searchResults.set(all);
          this.searchLoading.set(false);
        },
        error: () => this.searchLoading.set(false),
      });
    });
  }

  onSearch(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.searchTerm.set(term);
    this.searchSubject.next(term);
  }

  selectLoan(loan: Loan) {
    this.selectedLoan.set(loan);
    this.searchResults.set([]);   // ocultar el listado de búsqueda
    this.searchTerm.set(loan.customer?.fullName || '');
    this.loadCuotas(loan.id);
  }

  loadCuotas(loanId: string) {
    this.loading.set(true);
    this.api.get<any>(`/payments/cuotas-con-mora/${loanId}`).subscribe({
      next: (r) => {
        this.data.set(r);
        this.cuotas.set(r?.cuotas ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.snackbar.open(err.error?.message || 'Error al cargar las cuotas', 'Cerrar', { duration: 4000 });
      },
    });
  }

  eliminar(cuota: any) {
    if (!confirm(`¿Eliminar la mora de la cuota ${cuota.periodo} (${cuota.moraGenerada})? Esta acción no se puede deshacer.`)) return;
    this.deletingId.set(cuota.scheduleId);
    this.api.delete<any>(`/payments/mora/cuota/${cuota.scheduleId}`).subscribe({
      next: (r) => {
        this.deletingId.set(null);
        this.snackbar.open(r?.message || 'Mora eliminada', 'OK', { duration: 4000 });
        // Recargar las cuotas del crédito
        if (this.selectedLoan()) this.loadCuotas(this.selectedLoan()!.id);
      },
      error: (err) => {
        this.deletingId.set(null);
        this.snackbar.open(err.error?.message || 'Error al eliminar la mora', 'Cerrar', { duration: 5000 });
      },
    });
  }
}
