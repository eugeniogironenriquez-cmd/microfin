import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonCard, IonCardContent, IonItem, IonLabel, IonInput, IonTextarea,
  IonButton, IonIcon, IonSpinner, IonText, IonNote, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { refreshOutline, checkmarkCircle, calculatorOutline, cloudOfflineOutline } from 'ionicons/icons';

import { CollectionService } from '../../core/collection.service';
import { NetworkService } from '../../core/network.service';
import { AssignedClient } from '../../core/models';

@Component({
  selector: 'app-restructure',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardContent, IonItem, IonLabel, IonInput, IonTextarea,
    IonButton, IonIcon, IonSpinner, IonText, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/clients"></ion-back-button></ion-buttons>
        <ion-title>Reestructurar</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (!done()) {
        <ion-card>
          <ion-card-content>
            <h2 class="cli">{{ client()?.customerName }}</h2>
            <p class="muted">El crédito actual quedará reestructurado y se generará uno nuevo con estas condiciones.</p>

            <ion-item>
              <ion-label position="stacked">Nuevo monto</ion-label>
              <ion-input type="number" [(ngModel)]="principalAmount" (ionBlur)="simular()">
                <span slot="start">$&nbsp;</span>
              </ion-input>
            </ion-item>

            <ion-item>
              <ion-label position="stacked">Plazo (días)</ion-label>
              <ion-input type="number" [(ngModel)]="days" (ionBlur)="simular()"></ion-input>
            </ion-item>

            <ion-item>
              <ion-label position="stacked">Cuota diaria (opcional, ajustable)</ion-label>
              <ion-input type="number" [(ngModel)]="customPayment" (ionBlur)="simular()">
                <span slot="start">$&nbsp;</span>
              </ion-input>
            </ion-item>

            <ion-item>
              <ion-label position="stacked">Motivo de la reestructura</ion-label>
              <ion-textarea [(ngModel)]="restructureReason" [rows]="2"></ion-textarea>
            </ion-item>

            <!-- Previsualización (requiere conexión) -->
            @if (network.online()) {
              @if (simulando()) {
                <div class="sim"><ion-spinner name="crescent"></ion-spinner> Calculando...</div>
              } @else if (sim()) {
                <div class="sim-box">
                  <div class="sim-row"><span>Cuota diaria</span><strong>{{ sim()!.periodicPayment | currency:'MXN' }}</strong></div>
                  <div class="sim-row"><span>Total a pagar</span><strong>{{ sim()!.totalPayment | currency:'MXN' }}</strong></div>
                  <ion-note>Mínimo de cuota: {{ sim()!.minPayment | currency:'MXN' }}</ion-note>
                </div>
              }
            } @else {
              <ion-text color="warning">
                <p class="hint"><ion-icon name="cloud-offline-outline"></ion-icon>
                  Sin conexión: no se puede previsualizar. La reestructura se aplicará al sincronizar.</p>
              </ion-text>
            }

            <ion-button expand="block" color="primary" (click)="submit()" [disabled]="saving()">
              @if (saving()) { <ion-spinner name="crescent"></ion-spinner> }
              @else { <ion-icon slot="start" name="refresh-outline"></ion-icon> Aplicar reestructura }
            </ion-button>
          </ion-card-content>
        </ion-card>
      } @else {
        <div class="ok">
          <ion-icon name="checkmark-circle" color="success"></ion-icon>
          <h2>Reestructura registrada</h2>
          <p>{{ syncedNow() ? 'Aplicada en el servidor' : 'Se aplicará al recuperar conexión' }}</p>
        </div>
        <ion-button expand="block" (click)="finish()">Listo</ion-button>
      }
    </ion-content>
  `,
  styles: [`
    .cli { margin:0 0 4px; font-size:18px; font-weight:700; color:#1C4532; }
    .muted { color:#718096; font-size:13px; margin:0 0 8px; }
    .hint { font-size:13px; display:flex; align-items:center; gap:6px; }
    .sim { display:flex; align-items:center; gap:8px; color:#718096; margin:12px 0; }
    .sim-box { background:#F7FAFC; border-radius:10px; padding:12px 14px; margin:12px 0; }
    .sim-row { display:flex; justify-content:space-between; margin-bottom:6px; }
    .sim-row strong { color:#1C4532; }
    .ok { text-align:center; padding:24px 0 8px; }
    .ok ion-icon { font-size:64px; }
    .ok h2 { margin:8px 0 4px; }
    .ok p { color:#718096; font-size:14px; margin:0; }
  `],
})
export class RestructurePage implements OnInit {
  readonly collection = inject(CollectionService);
  readonly network = inject(NetworkService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastController);

  client = signal<AssignedClient | null>(null);
  principalAmount: number | null = null;
  days: number | null = null;
  customPayment: number | null = null;
  restructureReason = '';

  sim = signal<any>(null);
  simulando = signal(false);
  saving = signal(false);
  done = signal(false);
  syncedNow = signal(false);

  constructor() {
    addIcons({ refreshOutline, checkmarkCircle, calculatorOutline, cloudOfflineOutline });
  }

  ngOnInit() {
    const loanId = this.route.snapshot.paramMap.get('loanId')!;
    const c = this.collection.clients().find(x => x.loanId === loanId) || null;
    this.client.set(c);
    if (c?.principalAmount) this.principalAmount = c.principalAmount;
  }

  async simular() {
    if (!this.principalAmount || !this.days || !this.network.online()) return;
    this.simulando.set(true);
    try {
      const r = await this.collection.simularReestructura(
        Number(this.principalAmount), Number(this.days),
        this.customPayment ? Number(this.customPayment) : undefined,
      );
      this.sim.set(r);
    } catch {
      this.sim.set(null);
    } finally {
      this.simulando.set(false);
    }
  }

  async submit() {
    if (!this.principalAmount || this.principalAmount <= 0) { this.notify('Ingresa el monto'); return; }
    if (!this.days || this.days <= 0) { this.notify('Ingresa el plazo en días'); return; }
    if (!this.restructureReason.trim()) { this.notify('Indica el motivo de la reestructura'); return; }

    this.saving.set(true);
    try {
      const accion = await this.collection.registrarGestorAccion('REESTRUCTURA', this.client()!.loanId, {
        principalAmount: Number(this.principalAmount),
        days: Number(this.days),
        customPayment: this.customPayment ? Number(this.customPayment) : undefined,
        restructureReason: this.restructureReason.trim(),
      });
      this.syncedNow.set(accion.synced);
      this.done.set(true);
    } catch (e: any) {
      this.notify(e?.error?.message || 'Error al reestructurar');
    } finally {
      this.saving.set(false);
    }
  }

  finish() { this.router.navigate(['/clients'], { replaceUrl: true }); }

  private async notify(message: string) {
    const t = await this.toast.create({ message, duration: 2400, position: 'bottom' });
    await t.present();
  }
}
