import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonButton,
  IonIcon, IonSpinner, IonCard, IonCardContent, IonSegment, IonSegmentButton,
  IonText, IonChip, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline, cashOutline, checkmarkCircle, shareOutline,
  documentTextOutline, cloudOfflineOutline,
} from 'ionicons/icons';

import { CollectionService } from '../../core/collection.service';
import { GeoService } from '../../core/geo.service';
import { NetworkService } from '../../core/network.service';
import { TicketService } from '../../core/ticket.service';
import { AssignedClient, LocalPayment, PaymentType, PaymentMethod } from '../../core/models';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonButton,
    IonIcon, IonSpinner, IonCard, IonCardContent, IonSegment, IonSegmentButton,
    IonText, IonChip,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/clients"></ion-back-button></ion-buttons>
        <ion-title>Registrar pago</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (!done()) {
        <ion-card>
          <ion-card-content>
            <h2 class="cli">{{ client()?.customerName }}</h2>

            <!-- Tipo de pago -->
            <ion-label class="lbl">Tipo de pago</ion-label>
            <ion-segment [(ngModel)]="paymentType" value="DIA">
              <ion-segment-button value="DIA"><ion-label>Día</ion-label></ion-segment-button>
              <ion-segment-button value="TOTAL"><ion-label>Total</ion-label></ion-segment-button>
              <ion-segment-button value="MORATORIO"><ion-label>Mora</ion-label></ion-segment-button>
            </ion-segment>

            <!-- Monto -->
            <ion-item>
              <ion-label position="stacked">Monto recibido</ion-label>
              <ion-input type="number" [(ngModel)]="amount" placeholder="0.00">
                <span slot="start">$&nbsp;</span>
              </ion-input>
            </ion-item>

            <!-- Método -->
            <ion-item>
              <ion-label position="stacked">Método</ion-label>
              <ion-select [(ngModel)]="method" interface="action-sheet" value="EFECTIVO">
                <ion-select-option value="EFECTIVO">Efectivo</ion-select-option>
                <ion-select-option value="TRANSFERENCIA">Transferencia</ion-select-option>
                <ion-select-option value="DEPOSITO">Depósito</ion-select-option>
              </ion-select>
            </ion-item>

            <!-- Geolocalización -->
            <ion-chip [color]="geo() ? 'success' : 'medium'">
              <ion-icon name="location-outline"></ion-icon>
              <ion-label>
                @if (capturingGeo()) { Obteniendo ubicación... }
                @else if (geo()) { Ubicación capturada }
                @else { Sin ubicación }
              </ion-label>
            </ion-chip>

            @if (!network.online()) {
              <ion-text color="warning">
                <p class="hint"><ion-icon name="cloud-offline-outline"></ion-icon>
                  Sin conexión: el pago se guardará y sincronizará después.</p>
              </ion-text>
            }

            <ion-button expand="block" color="primary" (click)="submit()" [disabled]="saving()">
              @if (saving()) { <ion-spinner name="crescent"></ion-spinner> }
              @else { <ion-icon slot="start" name="cash-outline"></ion-icon> Registrar pago }
            </ion-button>
          </ion-card-content>
        </ion-card>
      } @else {
        <!-- Confirmación + ticket -->
        <div class="ok">
          <ion-icon name="checkmark-circle" color="success"></ion-icon>
          <h2>Pago registrado</h2>
          <p>{{ saved()?.synced ? 'Sincronizado con el servidor' : 'Guardado — se sincronizará al recuperar conexión' }}</p>
        </div>

        <ion-card>
          <ion-card-content>
            <pre class="ticket">{{ ticketText() }}</pre>
          </ion-card-content>
        </ion-card>

        <ion-button expand="block" fill="outline" (click)="share()">
          <ion-icon slot="start" name="share-outline"></ion-icon>
          Compartir ticket
        </ion-button>
        <ion-button expand="block" (click)="finish()">Listo</ion-button>
      }
    </ion-content>
  `,
  styles: [`
    .cli { margin:0 0 12px; font-size:18px; font-weight:700; color:#1C4532; }
    .lbl { font-size:13px; color:#718096; margin:8px 0 4px; display:block; }
    .hint { font-size:13px; display:flex; align-items:center; gap:6px; }
    ion-segment { margin-bottom:8px; }
    .ok { text-align:center; padding:24px 0 8px; }
    .ok ion-icon { font-size:64px; }
    .ok h2 { margin:8px 0 4px; }
    .ok p { color:#718096; font-size:14px; margin:0; }
    .ticket {
      font-family:'Courier New', monospace; font-size:12px; white-space:pre-wrap;
      line-height:1.5; margin:0;
    }
  `],
})
export class PaymentPage implements OnInit {
  readonly collection = inject(CollectionService);
  readonly network = inject(NetworkService);
  private geoSvc = inject(GeoService);
  private ticketSvc = inject(TicketService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastController);

  client = signal<AssignedClient | null>(null);
  amount: number | null = null;
  paymentType: PaymentType = 'DIA';
  method: PaymentMethod = 'EFECTIVO';

  geo = signal<{ lat: number; lng: number } | null>(null);
  capturingGeo = signal(false);
  saving = signal(false);
  done = signal(false);
  saved = signal<LocalPayment | null>(null);
  ticketText = signal('');

  constructor() {
    addIcons({
      locationOutline, cashOutline, checkmarkCircle, shareOutline,
      documentTextOutline, cloudOfflineOutline,
    });
  }

  async ngOnInit() {
    const loanId = this.route.snapshot.paramMap.get('loanId')!;
    const c = this.collection.clients().find(x => x.loanId === loanId) || null;
    this.client.set(c);
    // Sugerir la cuota diaria como monto por defecto
    if (c?.periodicPayment) this.amount = c.periodicPayment;

    // Capturar geolocalización al abrir (no bloqueante)
    this.capturingGeo.set(true);
    const pos = await this.geoSvc.getCurrentPosition();
    this.geo.set(pos);
    this.capturingGeo.set(false);
  }

  async submit() {
    if (!this.amount || this.amount <= 0) {
      this.notify('Ingresa un monto válido');
      return;
    }
    this.saving.set(true);
    try {
      const payment = await this.collection.registerPayment({
        loanId: this.client()!.loanId,
        amountPaid: Number(this.amount),
        paymentType: this.paymentType,
        method: this.method,
        lat: this.geo()?.lat,
        lng: this.geo()?.lng,
      });
      this.saved.set(payment);
      this.ticketText.set(this.ticketSvc.build(payment, this.client()));
      this.done.set(true);
    } catch (e: any) {
      this.notify(e?.error?.message || 'Error al registrar el pago');
    } finally {
      this.saving.set(false);
    }
  }

  async share() {
    const text = this.ticketText();
    // Web Share API si está disponible (Capacitor la soporta en Android)
    if ((navigator as any).share) {
      try { await (navigator as any).share({ text }); return; } catch { /* cancelado */ }
    }
    // Fallback: copiar al portapapeles
    try {
      await navigator.clipboard.writeText(text);
      this.notify('Ticket copiado');
    } catch {
      this.notify('No se pudo compartir');
    }
  }

  finish() {
    this.router.navigate(['/clients'], { replaceUrl: true });
  }

  private async notify(message: string) {
    const t = await this.toast.create({ message, duration: 2200, position: 'bottom' });
    await t.present();
  }
}
