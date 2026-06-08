import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-loan-convenio',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatTableModule, MatDividerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>handshake</mat-icon> Convenio de pago</h1>
      <a mat-stroked-button routerLink="/loans"><mat-icon>arrow_back</mat-icon> Préstamos</a>
    </div>

    <div class="info-banner">
      <mat-icon>info</mat-icon>
      <div>
        <strong>Convenio de pago sin intereses</strong>
        <p>Acuerda un monto a recuperar y repártelo en pagos según la periodicidad. El crédito
           actual quedará archivado como convenio. No genera intereses.</p>
      </div>
    </div>

    <div class="convenio-layout">
      <mat-card>
        <mat-card-header><mat-card-title>Términos del convenio</mat-card-title></mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="guardar()">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Monto del convenio *</mat-label>
              <input matInput type="number" formControlName="montoConvenio" (input)="recalc()">
              <span matPrefix>$&nbsp;</span>
              <mat-hint>Monto total acordado a recuperar</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Número de pagos *</mat-label>
              <input matInput type="number" formControlName="numeroPagos" (input)="recalc()">
            </mat-form-field>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Periodicidad *</mat-label>
              <mat-select formControlName="periodicidad" (selectionChange)="recalc()">
                <mat-option value="DIARIO">Diario (Lun-Vie)</mat-option>
                <mat-option value="SEMANAL">Semanal</mat-option>
                <mat-option value="QUINCENAL">Quincenal</mat-option>
                <mat-option value="MENSUAL">Mensual</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Fecha del primer pago *</mat-label>
              <input matInput [matDatepicker]="picker" formControlName="fechaPrimerPago" (dateChange)="recalc()">
              <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
              <mat-datepicker #picker></mat-datepicker>
            </mat-form-field>

            @if (cuota() > 0) {
              <div class="cuota-preview">
                <span>Cada pago será de</span>
                <strong>{{ cuota() | currency:'MXN' }}</strong>
              </div>
            }

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Observaciones</mat-label>
              <textarea matInput formControlName="notes" rows="2"></textarea>
            </mat-form-field>

            <button mat-raised-button color="primary" type="submit" class="w-full"
                    [disabled]="form.invalid || saving()">
              @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { <mat-icon>handshake</mat-icon> }
              Generar convenio
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Vista previa del calendario -->
      @if (previewDates().length > 0) {
        <mat-card>
          <mat-card-header><mat-card-title>Calendario del convenio</mat-card-title></mat-card-header>
          <mat-card-content>
            <table mat-table [dataSource]="previewRows()" class="w-full">
              <ng-container matColumnDef="num">
                <th mat-header-cell *matHeaderCellDef>#</th>
                <td mat-cell *matCellDef="let r">{{ r.num }}</td>
              </ng-container>
              <ng-container matColumnDef="fecha">
                <th mat-header-cell *matHeaderCellDef>Fecha</th>
                <td mat-cell *matCellDef="let r">{{ r.fecha | date:'EEE dd/MM/yyyy':'UTC' }}</td>
              </ng-container>
              <ng-container matColumnDef="monto">
                <th mat-header-cell *matHeaderCellDef>Monto</th>
                <td mat-cell *matCellDef="let r"><strong>{{ r.monto | currency:'MXN' }}</strong></td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="['num','fecha','monto']"></tr>
              <tr mat-row *matRowDef="let row; columns: ['num','fecha','monto'];"></tr>
            </table>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .info-banner {
      display:flex; align-items:flex-start; gap:14px; padding:16px 18px;
      background:#FFFBEB; border:1px solid #FDE68A; border-radius:12px; margin-bottom:16px;
    }
    .info-banner mat-icon { color:#D97706; }
    .info-banner strong { color:#92400E; }
    .info-banner p { margin:2px 0 0; font-size:13px; color:#92400E; }
    .convenio-layout { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
    @media(max-width:900px){ .convenio-layout { grid-template-columns:1fr; } }
    .w-full { width:100%; }
    .cuota-preview {
      display:flex; align-items:center; gap:8px; background:#F0FFF4;
      border-radius:8px; padding:12px 14px; margin-bottom:12px;
    }
    .cuota-preview strong { font-size:20px; color:#1C4532; }
  `],
})
export class LoanConvenioComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loanId = '';
  saving = signal(false);
  cuota = signal(0);
  previewDates = signal<Date[]>([]);

  form = this.fb.group({
    montoConvenio:   [null as number | null, [Validators.required, Validators.min(1)]],
    numeroPagos:     [2, [Validators.required, Validators.min(1)]],
    periodicidad:    ['SEMANAL', Validators.required],
    fechaPrimerPago: [null as Date | null, Validators.required],
    notes:           [''],
  });

  previewRows = computed(() => {
    const c = this.cuota();
    return this.previewDates().map((fecha, i) => ({ num: i + 1, fecha, monto: c }));
  });

  ngOnInit() {
    this.loanId = this.route.snapshot.paramMap.get('id')!;
  }

  recalc() {
    const monto = Number(this.form.value.montoConvenio);
    const num = Number(this.form.value.numeroPagos);
    if (monto > 0 && num > 0) {
      this.cuota.set(Math.round((monto / num) * 100) / 100);
    } else {
      this.cuota.set(0);
    }
    this.buildPreview();
  }

  // Vista previa local de fechas (réplica de la lógica del backend)
  buildPreview() {
    const num = Number(this.form.value.numeroPagos);
    const per = this.form.value.periodicidad;
    const fecha = this.form.value.fechaPrimerPago;
    if (!num || num <= 0 || !fecha) { this.previewDates.set([]); return; }

    const iso = new Date(fecha);
    const base = new Date(Date.UTC(iso.getFullYear(), iso.getMonth(), iso.getDate()));
    const isWeekend = (d: Date) => { const w = d.getUTCDay(); return w === 0 || w === 6; };
    const nextBiz = (d: Date) => { const x = new Date(d); do { x.setUTCDate(x.getUTCDate() + 1); } while (isWeekend(x)); return x; };

    const dates: Date[] = [];
    let cursor = new Date(base);
    for (let i = 0; i < num; i++) {
      if (i === 0) {
        if (per === 'DIARIO' && isWeekend(cursor)) cursor = nextBiz(cursor);
        dates.push(new Date(cursor)); continue;
      }
      if (per === 'DIARIO') cursor = nextBiz(cursor);
      else if (per === 'SEMANAL') { cursor = new Date(cursor); cursor.setUTCDate(cursor.getUTCDate() + 7); }
      else if (per === 'QUINCENAL') { cursor = new Date(cursor); cursor.setUTCDate(cursor.getUTCDate() + 15); }
      else { cursor = new Date(cursor); cursor.setUTCMonth(cursor.getUTCMonth() + 1); }
      dates.push(new Date(cursor));
    }
    this.previewDates.set(dates);
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const fecha = this.form.value.fechaPrimerPago!;
    const fechaIso = `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}`;

    this.saving.set(true);
    this.api.post<any>(`/loans/${this.loanId}/convenio`, {
      montoConvenio: this.form.value.montoConvenio,
      numeroPagos:   this.form.value.numeroPagos,
      periodicidad:  this.form.value.periodicidad,
      fechaPrimerPago: fechaIso,
      notes:         this.form.value.notes,
    }).subscribe({
      next: (r) => {
        this.snackbar.open('Convenio generado correctamente', 'OK', { duration: 4000 });
        this.saving.set(false);
        this.router.navigate(['/loans', r.loan.id]);
      },
      error: (err) => {
        const msg = Array.isArray(err.error?.message) ? err.error.message[0] : (err.error?.message || 'Error');
        this.snackbar.open(msg, 'Cerrar', { duration: 6000 });
        this.saving.set(false);
      },
    });
  }
}