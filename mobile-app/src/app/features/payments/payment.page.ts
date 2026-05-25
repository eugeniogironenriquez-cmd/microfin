// ============================================================
// PAYMENT PAGE - Registrar pagos (funciona offline)
// ============================================================
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton,
  IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonTextarea,
  IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon,
  IonBackButton, IonButtons, IonToast, IonSpinner, IonNote } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cashOutline, checkmarkCircleOutline, locationOutline, wifiOutline } from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { Network } from '@capacitor/network';
import { MobileAuthService } from '../../core/auth/auth.service';
import { OfflineDbService, OfflinePayment } from '../../core/db/offline-db.service';
import { SyncService } from '../../core/sync/sync.service';

addIcons({ cashOutline, checkmarkCircleOutline, locationOutline, wifiOutline });

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, ReactiveFormsModule,
    IonContent, IonHeader, IonTitle, IonToolbar, IonButton,
    IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonTextarea,
    IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon,
    IonBackButton, IonButtons, IonToast, IonSpinner, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/collection"></ion-back-button>
        </ion-buttons>
        <ion-title>Registrar pago</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (loan()) {
        <!-- Info del cliente -->
        <ion-card class="client-card">
          <ion-card-content>
            <h2>{{ loan()!.customer?.fullName }}</h2>
            <p>Cuota: <strong>{{ loan()!.periodicPayment | currency:'MXN' }}</strong></p>
            <p>Estado: <span class="status-{{ loan()!.status | lowercase }}">{{ loan()!.status }}</span></p>
          </ion-card-content>
        </ion-card>

        <!-- Formulario de pago -->
        <form [formGroup]="form" (ngSubmit)="submit()">
          <ion-item class="form-item">
            <ion-label position="stacked">Monto recibido *</ion-label>
            <ion-input type="number" formControlName="amountPaid"
                       [value]="loan()!.periodicPayment" placeholder="0.00">
            </ion-input>
          </ion-item>

          <ion-item class="form-item">
            <ion-label position="stacked">Forma de pago</ion-label>
            <ion-select formControlName="method" interface="action-sheet">
              <ion-select-option value="EFECTIVO">💵 Efectivo</ion-select-option>
              <ion-select-option value="TRANSFERENCIA">📱 Transferencia</ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item class="form-item">
            <ion-label position="stacked">Referencia (opcional)</ion-label>
            <ion-input formControlName="reference" placeholder="Número de transacción"></ion-input>
          </ion-item>

          <ion-item class="form-item">
            <ion-label position="stacked">Observaciones</ion-label>
            <ion-textarea formControlName="notes" rows="2"
                          placeholder="Notas del cobro..."></ion-textarea>
          </ion-item>

          <!-- Geolocalización -->
          <ion-item lines="none" class="geo-item">
            <ion-icon name="location-outline" slot="start"></ion-icon>
            <ion-label>
              @if (geoLoading()) { Obteniendo ubicación... }
              @else if (geolocation()) { Ubicación capturada ✓ }
              @else { Sin ubicación }
            </ion-label>
            <ion-button slot="end" fill="outline" size="small" type="button" (click)="getLocation()">
              <ion-icon name="location-outline" slot="icon-only"></ion-icon>
            </ion-button>
          </ion-item>

          <!-- Modo offline indicator -->
          @if (!isOnline()) {
            <ion-note class="offline-note" color="warning">
              <ion-icon name="wifi-outline"></ion-icon>
              Sin conexión — el pago se guardará localmente y se sincronizará automáticamente.
            </ion-note>
          }

          <ion-button
            type="submit"
            expand="block"
            color="primary"
            class="submit-btn"
            [disabled]="form.invalid || saving()">
            @if (saving()) {
              <ion-spinner name="crescent" slot="start"></ion-spinner>
            } @else {
              <ion-icon name="checkmark-circle-outline" slot="start"></ion-icon>
            }
            Registrar pago
          </ion-button>
        </form>
      } @else {
        <div class="loading-center">
          <ion-spinner name="crescent"></ion-spinner>
        </div>
      }

      <!-- Toast de éxito -->
      <ion-toast
        [isOpen]="showSuccess()"
        message="✅ Pago registrado exitosamente"
        duration="3000"
        color="success"
        (didDismiss)="showSuccess.set(false)">
      </ion-toast>
    </ion-content>
  `,
  styles: [`
    .client-card { background: var(--ion-color-light); }
    .client-card h2 { font-size: 18px; font-weight: 600; margin: 0 0 6px; }
    .form-item { margin-bottom: 8px; --inner-padding-start: 0; }
    .geo-item { margin: 8px 0; border: 1px solid var(--ion-color-light-shade); border-radius: 8px; }
    .offline-note { display: flex; align-items: center; gap: 6px; padding: 10px 12px; background: var(--ion-color-warning-tint); border-radius: 8px; margin: 10px 0; font-size: 13px; }
    .submit-btn { margin-top: 24px; height: 52px; }
    .loading-center { display: flex; justify-content: center; padding: 48px; }
    .status-activo { color: green; font-weight: 600; }
    .status-vencido { color: red; font-weight: 600; }
  `],
})
export class PaymentPage implements OnInit {
  private route = inject(ActivatedRoute);
  private auth = inject(MobileAuthService);
  private offlineDb = inject(OfflineDbService);
  private syncService = inject(SyncService);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  loan = signal<any>(null);
  geolocation = signal<{ lat: number; lng: number } | null>(null);
  geoLoading = signal(false);
  saving = signal(false);
  showSuccess = signal(false);
  isOnline = signal(true);

  form = this.fb.group({
    amountPaid: [null as number | null, [Validators.required, Validators.min(0.01)]],
    method: ['EFECTIVO', Validators.required],
    reference: [''],
    notes: [''],
  });

  async ngOnInit() {
    const loanId = this.route.snapshot.paramMap.get('loanId');
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.token()}` });
    this.http.get<any>(`${this.auth.getApiUrl()}/loans/${loanId}`, { headers }).subscribe({
      next: (res) => {
        this.loan.set(res.data || res);
        this.form.patchValue({ amountPaid: Number((res.data || res).periodicPayment) });
      },
    });

    const status = await Network.getStatus();
    this.isOnline.set(status.connected);
    Network.addListener('networkStatusChange', (s) => this.isOnline.set(s.connected));

    this.getLocation();
  }

  async getLocation() {
    this.geoLoading.set(true);
    try {
      const pos = await Geolocation.getCurrentPosition({ timeout: 8000 });
      this.geolocation.set({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      console.warn('No se pudo obtener ubicación');
    } finally {
      this.geoLoading.set(false);
    }
  }

  async submit() {
    if (this.form.invalid || !this.loan()) return;
    this.saving.set(true);

    const paymentData = {
      loanId: this.loan()!.id,
      amountPaid: Number(this.form.value.amountPaid),
      method: this.form.value.method!,
      reference: this.form.value.reference || undefined,
      notes: this.form.value.notes || undefined,
      paymentDate: new Date().toISOString(),
      geolocation: this.geolocation() || undefined,
    };

    try {
      // Guardar siempre en local primero
      await this.offlineDb.savePayment(paymentData);
      await this.syncService.refreshPendingCount();

      // Intentar sincronizar si hay red
      if (this.isOnline()) {
        await this.syncService.sync();
      }

      this.showSuccess.set(true);
      this.form.reset({ method: 'EFECTIVO' });
      this.saving.set(false);
    } catch (err) {
      console.error('Error guardando pago:', err);
      this.saving.set(false);
    }
  }
}
