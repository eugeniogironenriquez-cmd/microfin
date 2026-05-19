import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-loan-restructure',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatStepperModule, MatDividerModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon color="warn">refresh</mat-icon> Reestructuración de crédito</h1>
      <a mat-stroked-button [routerLink]="['/loans', loanId()]">
        <mat-icon>arrow_back</mat-icon> Volver
      </a>
    </div>
    @if (loading()) {
      <div class="loading-overlay"><mat-spinner></mat-spinner></div>
    } @else if (loan()) {
      <mat-stepper linear>
        <mat-step label="Saldo a reestructurar" [completed]="!!settlement()">
          <mat-card>
            <mat-card-header><mat-card-title>Crédito original</mat-card-title></mat-card-header>
            <mat-card-content>
              <div class="info-rows">
                <div class="info-row"><span>Cliente</span><strong>{{ loan()!.customer?.fullName }}</strong></div>
                <div class="info-row"><span>Monto original</span><strong>{{ loan()!.principalAmount | currency:'MXN' }}</strong></div>
                <div class="info-row"><span>Estado</span><strong>{{ loan()!.status }}</strong></div>
              </div>
              @if (settlement()) {
                <mat-divider style="margin:16px 0"></mat-divider>
                <div class="breakdown">
                  <div class="brow"><span>Capital pendiente</span><strong>{{ settlement()!.capitalBalance | currency:'MXN' }}</strong></div>
                  <div class="brow warn"><span>Moratorios</span><strong>{{ settlement()!.lateInterest | currency:'MXN' }}</strong></div>
                  <mat-divider></mat-divider>
                  <div class="brow total"><span>NUEVO CAPITAL</span><strong>{{ settlement()!.total | currency:'MXN' }}</strong></div>
                </div>
              } @else {
                <button mat-raised-button color="primary" (click)="loadSettlement()" style="margin-top:16px">
                  <mat-icon>calculate</mat-icon> Calcular saldo
                </button>
              }
            </mat-card-content>
            <mat-card-actions>
              <button mat-raised-button color="primary" matStepperNext [disabled]="!settlement()">Siguiente</button>
            </mat-card-actions>
          </mat-card>
        </mat-step>

        <mat-step label="Nuevas condiciones">
          <mat-card>
            <mat-card-content>
              <form [formGroup]="restructureForm" class="step-form">
                <mat-form-field appearance="outline">
                  <mat-label>Nuevo plazo (semanas) *</mat-label>
                  <input matInput type="number" formControlName="newTermWeeks">
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Nueva tasa (opcional)</mat-label>
                  <input matInput type="number" step="0.001" formControlName="newInterestRate">
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Motivo *</mat-label>
                  <mat-select formControlName="reason">
                    <mat-option value="DESEMPLEO">Desempleo</mat-option>
                    <mat-option value="ENFERMEDAD">Enfermedad</mat-option>
                    <mat-option value="REDUCCION_INGRESOS">Reducción de ingresos</mat-option>
                    <mat-option value="OTRO">Otro</mat-option>
                  </mat-select>
                </mat-form-field>
              </form>
            </mat-card-content>
            <mat-card-actions>
              <button mat-stroked-button matStepperPrevious>Anterior</button>
              <button mat-raised-button color="primary" matStepperNext [disabled]="restructureForm.invalid">Siguiente</button>
            </mat-card-actions>
          </mat-card>
        </mat-step>

        <mat-step label="Confirmar">
          <mat-card>
            <mat-card-content>
              <div class="info-rows">
                <div class="info-row"><span>Nuevo capital</span><strong class="primary">{{ settlement()?.total | currency:'MXN' }}</strong></div>
                <div class="info-row"><span>Nuevo plazo</span><strong>{{ restructureForm.value.newTermWeeks }} semanas</strong></div>
                <div class="info-row"><span>Motivo</span><strong>{{ restructureForm.value.reason }}</strong></div>
              </div>
              <div class="warning-box">
                <mat-icon color="warn">warning</mat-icon>
                <p>Esta acción no se puede deshacer.</p>
              </div>
            </mat-card-content>
            <mat-card-actions>
              <button mat-stroked-button matStepperPrevious>Anterior</button>
              <button mat-raised-button color="warn" (click)="confirm()" [disabled]="submitting()">
                @if (submitting()) { <mat-spinner diameter="20"></mat-spinner> } @else { <mat-icon>check</mat-icon> }
                Confirmar
              </button>
            </mat-card-actions>
          </mat-card>
        </mat-step>
      </mat-stepper>
    }
  `
})
export class LoanRestructureComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loanId = signal('');
  loan = signal<any>(null);
  settlement = signal<any>(null);
  loading = signal(true);
  submitting = signal(false);

  restructureForm = this.fb.group({
    newTermWeeks: [12, [Validators.required, Validators.min(1)]],
    newInterestRate: [null as number | null],
    reason: ['', Validators.required],
  });

  ngOnInit() {
    this.loanId.set(this.route.snapshot.paramMap.get('id')!);
    this.api.get<any>(`/loans/${this.loanId()}`).subscribe({
      next: (l) => { this.loan.set(l); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadSettlement() {
    this.api.get<any>(`/loans/${this.loanId()}/early-settlement`).subscribe({
      next: (s) => this.settlement.set(s),
    });
  }

  confirm() {
    if (this.restructureForm.invalid) return;
    this.submitting.set(true);
    this.api.post<any>(`/loans/${this.loanId()}/restructure`, {
      newTermWeeks: this.restructureForm.value.newTermWeeks,
      newInterestRate: this.restructureForm.value.newInterestRate || undefined,
      reason: this.restructureForm.value.reason,
    }).subscribe({
      next: () => { this.snackbar.open('Reestructuración exitosa', 'Cerrar', { duration: 5000 }); this.submitting.set(false); },
      error: (err: any) => { this.snackbar.open(err.error?.message?.[0] || 'Error', 'Cerrar', { duration: 5000 }); this.submitting.set(false); },
    });
  }
}
