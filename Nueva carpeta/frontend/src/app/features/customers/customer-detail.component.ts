import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { PdfDownloadService } from '../../core/pdf-download.service';
import { ApiService, AuthService, Customer, Loan } from '../../core/index';

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, RouterLink,
    MatCardModule, MatButtonModule, MatIconModule, MatTableModule,
    MatProgressSpinnerModule, MatTabsModule, MatChipsModule,
  ],
  template: `
    @if (loading()) {
      <div class="loading-overlay"><mat-spinner></mat-spinner></div>
    } @else if (customer()) {
      <div class="page-header">
        <h1><mat-icon>person</mat-icon> {{ customer()!.fullName }}</h1>
        <div class="header-actions">
          <a mat-stroked-button routerLink="/customers">
            <mat-icon>arrow_back</mat-icon> Clientes
          </a>
          @if (auth.can('clientes.editar')) {
            <a mat-stroked-button [routerLink]="['/customers', customer()!.id, 'edit']">
              <mat-icon>edit</mat-icon> Editar
            </a>
          }
          <label class="chk-liquidados">
            <input type="checkbox" [checked]="incluirLiquidados()"
                   (change)="incluirLiquidados.set($any($event.target).checked)">
            Incluir liquidados
          </label>
          <button mat-stroked-button (click)="imprimirHistorialPdf()">
            <mat-icon>picture_as_pdf</mat-icon> Historial PDF
          </button>
          <button mat-stroked-button (click)="imprimirHistorialExcel()">
            <mat-icon>table_view</mat-icon> Historial Excel
          </button>
          @if (auth.can('prestamos.crear')) {
            <a mat-raised-button color="primary" routerLink="/loans/new">
              <mat-icon>add</mat-icon> Nueva solicitud
            </a>
          }
        </div>
      </div>

      <mat-tab-group>
        <!-- Datos personales -->
        <mat-tab label="Datos personales">
          <div class="tab-content">
            <div class="info-grid">
              <div class="info-card">
                <h3>Identificación</h3>
                <div class="info-row"><span>CURP</span><code>{{ customer()!.curp }}</code></div>
                <div class="info-row"><span>Teléfono</span><strong>{{ customer()!.phone }}</strong></div>
                <div class="info-row"><span>F. nacimiento</span><span>{{ customer()!.birthDate | date:'dd/MM/yyyy' }}</span></div>
                <div class="info-row"><span>Edad</span><span>{{ edad() }}</span></div>
                <div class="info-row"><span>Estado</span>
                  <span class="status-badge status-{{ customer()!.status | lowercase }}">{{ customer()!.status }}</span>
                </div>
              </div>

              <div class="info-card">
                <h3>Económicos</h3>
                <div class="info-row"><span>Ocupación</span><span>{{ customer()!.occupation || '—' }}</span></div>
                <div class="info-row"><span>Giro</span><span>{{ customer()!.businessType || '—' }}</span></div>
                <div class="info-row">
                  <span>Ingreso diario</span>
                  <span>{{ ($any(customer())?.dailyIncome ?? 0) | currency:'MXN' }}</span>
                </div>
              </div>

              @if (customer()!.address) {
                <div class="info-card">
                  <h3>Domicilio</h3>
                  <div class="info-row"><span>Calle</span><span>{{ customer()!.address!.street }}</span></div>
                  <div class="info-row"><span>Colonia</span><span>{{ customer()!.address!.colonia }}</span></div>
                  <div class="info-row"><span>Municipio</span><span>{{ customer()!.address!.municipality }}</span></div>
                  <div class="info-row"><span>Estado</span><span>{{ customer()!.address!.state }}</span></div>
                  <div class="info-row"><span>CP</span><span>{{ customer()!.address!.zip }}</span></div>
                </div>
              }
            </div>
          </div>
        </mat-tab>

        <!-- Historial de créditos -->
        <mat-tab label="Historial de créditos ({{ loans().length }})">
          <div class="tab-content">
            @if (loans().length === 0) {
              <div class="empty-state">
                <mat-icon>account_balance_wallet</mat-icon>
                <p>El cliente no tiene créditos registrados</p>
                @if (auth.can('prestamos.crear')) {
                  <a mat-raised-button color="primary" routerLink="/loans/new">Crear primera solicitud</a>
                }
              </div>
            } @else {
              <table mat-table [dataSource]="loans()">
                <ng-container matColumnDef="id">
                  <th mat-header-cell *matHeaderCellDef>ID</th>
                  <td mat-cell *matCellDef="let r"><code>{{ r.id | slice:0:8 }}...</code></td>
                </ng-container>
                <ng-container matColumnDef="amount">
                  <th mat-header-cell *matHeaderCellDef>Monto</th>
                  <td mat-cell *matCellDef="let r">{{ r.principalAmount | currency:'MXN' }}</td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Estado</th>
                  <td mat-cell *matCellDef="let r">
                    <span class="status-badge status-{{ r.status | lowercase }}">{{ r.status }}</span>
                  </td>
                </ng-container>
                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>Fecha</th>
                  <td mat-cell *matCellDef="let r">{{ r.createdAt | date:'dd/MM/yyyy' }}</td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let r">
                    <a mat-icon-button [routerLink]="['/loans', r.id]"><mat-icon>visibility</mat-icon></a>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="loanCols"></tr>
                <tr mat-row *matRowDef="let row; columns: loanCols;"></tr>
              </table>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    .chk-liquidados {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: #4A5568;
      cursor: pointer;
      user-select: none;
      margin-right: 4px;
    }
    .chk-liquidados input { cursor: pointer; }
  `],
})
export class CustomerDetailComponent implements OnInit {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);
  private pdfSvc = inject(PdfDownloadService);
  private route = inject(ActivatedRoute);

  customer = signal<Customer | null>(null);
  // Si el historial impreso debe incluir los créditos liquidados (por defecto sí).
  incluirLiquidados = signal(true);
  photoUrl = signal<string | null>(null);
  loans = signal<Loan[]>([]);
  loading = signal(true);
  loanCols = ['id', 'amount', 'status', 'date', 'actions'];

  edad(): string {
    const b = this.customer()?.birthDate;
    if (!b) return '—';
    const birth = new Date(b);
    if (isNaN(birth.getTime())) return '—';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 0 ? `${age} años` : '—';
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.get<Customer>(`/customers/${id}`).subscribe({
      next: (c) => {
        this.customer.set(c);
        if ((c as any).loans) this.loans.set((c as any).loans);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.get<Loan[]>(`/customers/${id}/loans`).subscribe({
      next: (l) => this.loans.set(l),
    });
  }

  // Historial del cliente (todos sus créditos con atrasos y moratorios) en PDF.
  imprimirHistorialPdf() {
    const id = this.customer()?.id;
    if (!id) return;
    const q = this.incluirLiquidados() ? '' : '?incluirLiquidados=false';
    this.pdfSvc.open(`/reports/client-history/${id}/pdf${q}`);
  }

  // Mismo historial en Excel.
  imprimirHistorialExcel() {
    const id = this.customer()?.id;
    if (!id) return;
    const q = this.incluirLiquidados() ? '' : '?incluirLiquidados=false';
    this.pdfSvc.download(
      `/reports/client-history/${id}/excel${q}`,
      `historial-${(this.customer()?.fullName || 'cliente').replace(/\s+/g, '-').toLowerCase()}.xlsx`,
    );
  }
}