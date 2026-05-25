// ============================================================
// VISIT PAGE - Registro de visitas de cobranza (offline-first)
// ============================================================
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton,
  IonItem, IonLabel, IonSelect, IonSelectOption, IonTextarea, IonInput,
  IonCard, IonCardContent, IonBackButton, IonButtons, IonToast, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline } from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { OfflineDbService } from '../../core/db/offline-db.service';
import { SyncService } from '../../core/sync/sync.service';

addIcons({ checkmarkOutline });

@Component({
  selector: 'app-visit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    IonContent, IonHeader, IonTitle, IonToolbar, IonButton,
    IonItem, IonLabel, IonSelect, IonSelectOption, IonTextarea, IonInput,
    IonCard, IonCardContent, IonBackButton, IonButtons, IonToast, IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/collection"></ion-back-button></ion-buttons>
        <ion-title>Registrar visita</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <form [formGroup]="form" (ngSubmit)="submit()">
        <ion-item class="form-item">
          <ion-label position="stacked">Resultado de visita *</ion-label>
          <ion-select formControlName="type" interface="action-sheet"
                      placeholder="Seleccionar resultado">
            <ion-select-option value="NO_LOCALIZADO">🔍 No localizado</ion-select-option>
            <ion-select-option value="PROMESA_PAGO">🤝 Promesa de pago</ion-select-option>
            <ion-select-option value="PAGO_RECIBIDO">✅ Pago recibido</ion-select-option>
            <ion-select-option value="RECHAZO">❌ Rechazo</ion-select-option>
          </ion-select>
        </ion-item>

        @if (form.value.type === 'PROMESA_PAGO') {
          <ion-item class="form-item">
            <ion-label position="stacked">Monto prometido</ion-label>
            <ion-input type="number" formControlName="promisedAmount" placeholder="0.00"></ion-input>
          </ion-item>
          <ion-item class="form-item">
            <ion-label position="stacked">Fecha prometida</ion-label>
            <ion-input type="date" formControlName="promisedDate"></ion-input>
          </ion-item>
        }

        <ion-item class="form-item">
          <ion-label position="stacked">Observaciones</ion-label>
          <ion-textarea formControlName="notes" rows="3"
                        placeholder="Describe la situación del cliente..."></ion-textarea>
        </ion-item>

        <ion-button type="submit" expand="block" color="success" class="submit-btn"
                    [disabled]="form.invalid || saving()">
          @if (saving()) { <ion-spinner name="crescent" slot="start"></ion-spinner> }
          Guardar visita
        </ion-button>
      </form>

      <ion-toast [isOpen]="showSuccess()" message="Visita registrada"
                 duration="2500" color="success" (didDismiss)="showSuccess.set(false)">
      </ion-toast>
    </ion-content>
  `,
  styles: [`.form-item { margin-bottom: 8px; } .submit-btn { margin-top: 24px; }`],
})
export class VisitPage implements OnInit {
  private route = inject(ActivatedRoute);
  private db = inject(OfflineDbService);
  private syncService = inject(SyncService);
  private fb = inject(FormBuilder);

  loanId = signal('');
  saving = signal(false);
  showSuccess = signal(false);

  form = this.fb.group({
    type: ['', Validators.required],
    promisedAmount: [null as number | null],
    promisedDate: [''],
    notes: [''],
  });

  ngOnInit() {
    this.loanId.set(this.route.snapshot.paramMap.get('loanId') || '');
  }

  async submit() {
    if (this.form.invalid) return;
    this.saving.set(true);

    let geo: { lat: number; lng: number } | undefined;
    try {
      const pos = await Geolocation.getCurrentPosition({ timeout: 5000 });
      geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch { /* sin geo */ }

    await this.db.saveVisit({
      loanId: this.loanId(),
      type: this.form.value.type!,
      promisedAmount: this.form.value.promisedAmount || undefined,
      promisedDate: this.form.value.promisedDate || undefined,
      notes: this.form.value.notes || undefined,
      geolocation: geo,
      visitedAt: new Date().toISOString(),
    });

    await this.syncService.refreshPendingCount();
    await this.syncService.sync();

    this.showSuccess.set(true);
    this.form.reset();
    this.saving.set(false);
  }
}
