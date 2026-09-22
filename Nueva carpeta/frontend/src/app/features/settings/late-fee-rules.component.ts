import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService, LoanType } from '../../core/index';

@Component({
  selector: 'app-late-fee-rules',
  standalone: true,
  imports: [
    CommonModule, DecimalPipe, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatTableModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>gavel</mat-icon> Configuración de moratorios</h1>
    </div>
    <div class="lf-layout">
      <mat-card class="lf-form-card">
        <mat-card-header>
          <mat-card-title>Nuevo tramo</mat-card-title>
          <mat-card-subtitle>Cargo por días de atraso por cuota</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="save()" class="lf-form">
            <mat-form-field appearance="outline">
              <mat-label>Tipo de crédito *</mat-label>
              <mat-select formControlName="loanTypeId" (selectionChange)="loadRules()">
                @for (t of loanTypes(); track t.id) {
                  <mat-option [value]="t.id">{{ t.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <div class="lf-row2">
              <mat-form-field appearance="outline">
                <mat-label>Desde el día *</mat-label>
                <input matInput type="number" formControlName="dayFrom" min="1">
                <mat-hint>Día 1 = 1er día de atraso</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Hasta el día</mat-label>
                <input matInput type="number" formControlName="dayTo" min="1">
                <mat-hint>Vacío = sin límite</mat-hint>
              </mat-form-field>
            </div>
            <mat-form-field appearance="outline">
              <mat-label>Tipo de cargo *</mat-label>
              <mat-select formControlName="chargeType">
                <mat-option value="FIJO">Monto fijo por día ($)</mat-option>
                <mat-option value="PORCENTAJE">Porcentaje del saldo por día</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Importe *</mat-label>
              <input matInput type="number" step="0.01" formControlName="amount">
              @if (form.value.chargeType === 'PORCENTAJE') {
                <mat-hint>Decimal: 0.05 = 5% del saldo vencido por día</mat-hint>
              } @else {
                <mat-hint>Pesos fijos por cada día de atraso</mat-hint>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Descripción</mat-label>
              <input matInput formControlName="description" placeholder="Ej: Cargo días 1-6">
            </mat-form-field>
            <button mat-raised-button color="primary" type="submit"
                    [disabled]="form.invalid || saving()">
              @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { <mat-icon>add_circle</mat-icon> }
              Agregar tramo
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <div class="lf-rules-panel">
        @if (form.value.loanTypeId) {
          <mat-card>
            <mat-card-header>
              <mat-card-title>Tramos de: {{ loanTypeName() }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (loadingRules()) {
                <div style="display:flex;justify-content:center;padding:32px">
                  <mat-spinner diameter="36"></mat-spinner>
                </div>
              } @else if (rules().length === 0) {
                <div style="display:flex;flex-direction:column;align-items:center;padding:32px;color:rgba(0,0,0,.4)">
                  <mat-icon>info_outline</mat-icon>
                  <p>Sin tramos configurados</p>
                </div>
              } @else {
                <table mat-table [dataSource]="rules()" style="width:100%">
                  <ng-container matColumnDef="range">
                    <th mat-header-cell *matHeaderCellDef>Días</th>
                    <td mat-cell *matCellDef="let r">
                      <strong>{{ r.dayFrom }}</strong>
                      @if (r.dayTo) { – <strong>{{ r.dayTo }}</strong> }
                      @else { en adelante }
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="type">
                    <th mat-header-cell *matHeaderCellDef>Tipo</th>
                    <td mat-cell *matCellDef="let r">
                      <span [style.background]="r.chargeType === 'FIJO' ? '#DBEAFE' : '#EDE9FE'"
                            [style.color]="r.chargeType === 'FIJO' ? '#1E40AF' : '#5B21B6'"
                            style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">
                        {{ r.chargeType === 'FIJO' ? 'Fijo' : 'Porcentaje' }}
                      </span>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="amount">
                    <th mat-header-cell *matHeaderCellDef>Cargo diario</th>
                    <td mat-cell *matCellDef="let r">
                      @if (r.chargeType === 'FIJO') {
                        <strong>$ {{ r.amount | number:'1.2-2' }}</strong>
                      } @else {
                        <strong>{{ (r.amount * 100) | number:'1.2-2' }}%</strong>
                      }
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="desc">
                    <th mat-header-cell *matHeaderCellDef>Descripción</th>
                    <td mat-cell *matCellDef="let r" style="color:rgba(0,0,0,.5);font-size:12px">
                      {{ r.description || '—' }}
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef></th>
                    <td mat-cell *matCellDef="let r">
                      <button mat-icon-button color="warn" (click)="remove(r.id)"
                              matTooltip="Eliminar tramo">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="cols"></tr>
                  <tr mat-row *matRowDef="let row; columns: cols;"></tr>
                </table>

                <div style="display:flex;gap:10px;background:#F0FDF4;border:1px solid #BBF7D0;
                            border-radius:8px;padding:14px;margin-top:16px;font-size:13px">
                  <mat-icon style="color:#16A34A;flex-shrink:0">info</mat-icon>
                  <div>
                    <strong>Ejemplo con saldo vencido de $1,000:</strong>
                    @for (r of rules(); track r.id) {
                      <div style="margin-top:4px;color:rgba(0,0,0,.7)">
                        Días {{ r.dayFrom }}{{ r.dayTo ? '-' + r.dayTo : '+' }}:
                        @if (r.chargeType === 'FIJO') {
                          $ {{ r.amount }}/día
                        } @else {
                          {{ (r.amount * 100) | number:'1.1-1' }}% = {{ (1000 * r.amount) | number:'1.2-2' }} $/día
                        }
                      </div>
                    }
                  </div>
                </div>
              }
            </mat-card-content>
          </mat-card>
        } @else {
          <mat-card>
            <mat-card-content style="display:flex;align-items:center;gap:12px;padding:32px;color:rgba(0,0,0,.4)">
              <mat-icon>arrow_back</mat-icon>
              <p>Selecciona un tipo de crédito para configurar sus moratorios.</p>
            </mat-card-content>
          </mat-card>
        }
      </div>
    </div>
  `
})
export class LateFeeRulesComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loanTypes = signal<LoanType[]>([]);
  rules = signal<any[]>([]);
  loading = signal(true);
  loadingRules = signal(false);
  saving = signal(false);
  cols = ['range', 'type', 'amount', 'desc', 'actions'];

  form = this.fb.group({
    loanTypeId:  ['', Validators.required],
    dayFrom:     [1, [Validators.required, Validators.min(1)]],
    dayTo:       [null as number | null],
    chargeType:  ['FIJO', Validators.required],
    amount:      [null as number | null, [Validators.required, Validators.min(0.01)]],
    description: [''],
  });

  loanTypeName() {
    return this.loanTypes().find(t => t.id === this.form.value.loanTypeId)?.name || '';
  }

  ngOnInit() {
    this.api.get<LoanType[]>('/settings/loan-types').subscribe({
      next: (t) => { this.loanTypes.set(t); this.loading.set(false); },
    });
  }

  loadRules() {
    const id = this.form.value.loanTypeId;
    if (!id) return;
    this.loadingRules.set(true);
    this.api.get<any[]>('/late-fee-rules/loan-type/' + id).subscribe({
      next: (r) => { this.rules.set(r); this.loadingRules.set(false); },
      error: () => this.loadingRules.set(false),
    });
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.post('/late-fee-rules', this.form.value).subscribe({
      next: () => {
        this.snackbar.open('Tramo agregado', 'OK', { duration: 3000 });
        this.saving.set(false);
        this.form.patchValue({ dayFrom: 1, dayTo: null, amount: null, description: '' });
        this.loadRules();
      },
      error: (err: any) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error al guardar', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  remove(id: string) {
    this.api.delete('/late-fee-rules/' + id).subscribe({
      next: () => {
        this.snackbar.open('Tramo eliminado', 'OK', { duration: 2000 });
        this.loadRules();
      },
    });
  }
}
