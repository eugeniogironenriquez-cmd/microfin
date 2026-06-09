import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonIcon,
  IonSpinner, IonItem, IonLabel, IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cashOutline, walletOutline, alertCircleOutline, callOutline } from 'ionicons/icons';

import { CollectionService } from '../../core/collection.service';
import { NetworkService } from '../../core/network.service';
import { AssignedClient, PaymentInfo } from '../../core/models';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonIcon,
    IonSpinner, IonItem, IonLabel, IonBadge,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/clients"></ion-back-button></ion-buttons>
        <ion-title>Cliente</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (client()) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ client()!.customerName }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-item lines="none">
              <ion-icon name="call-outline" slot="start" color="medium"></ion-icon>
              <ion-label>{{ client()!.phone || 'Sin teléfono' }}</ion-label>
              <ion-badge slot="end" [class]="client()!.estado === 'vencido' ? 'estado-vencido' : 'estado-corriente'">
                {{ client()!.estado === 'vencido' ? 'Vencido' : 'Al corriente' }}
              </ion-badge>
            </ion-item>
          </ion-card-content>
        </ion-card>

        @if (loadingInfo()) {
          <div class="center"><ion-spinner name="crescent"></ion-spinner></div>
        } @else if (info()) {
          <ion-card>
            <ion-card-content>
              <div class="kpi-row">
                <div class="kpi">
                  <span class="kpi-lbl">Cuota diaria</span>
                  <span class="kpi-val">{{ info()!.cuotaDiaria | currency:'MXN':'symbol':'1.0-0' }}</span>
                </div>
                <div class="kpi">
                  <span class="kpi-lbl">Saldo pendiente</span>
                  <span class="kpi-val">{{ info()!.saldoPendiente | currency:'MXN':'symbol':'1.0-0' }}</span>
                </div>
              </div>
              @if (info()!.moraPendiente > 0) {
                <div class="mora-box">
                  <ion-icon name="alert-circle-outline"></ion-icon>
                  <span>Mora pendiente: <strong>{{ info()!.moraPendiente | currency:'MXN' }}</strong>
                    ({{ info()!.totalDiasMora }} días)</span>
                </div>
              }
              @if (info()!.proximaCuota) {
                <ion-item lines="none">
                  <ion-label>
                    <p>Próxima cuota #{{ info()!.proximaCuota!.periodo }}</p>
                    <h3>{{ info()!.proximaCuota!.monto | currency:'MXN' }} — vence {{ info()!.proximaCuota!.vence | date:'dd/MM/yyyy':'UTC' }}</h3>
                  </ion-label>
                </ion-item>
              }
            </ion-card-content>
          </ion-card>
        } @else if (!network.online()) {
          <p class="offline-note">Sin conexión: no se pudo cargar el saldo actual. Puedes registrar el pago igual; se sincronizará después.</p>
        }

        <ion-button expand="block" color="primary" (click)="goPay()">
          <ion-icon slot="start" name="cash-outline"></ion-icon>
          Registrar pago
        </ion-button>
      } @else {
        <div class="center"><ion-spinner name="crescent"></ion-spinner></div>
      }
    </ion-content>
  `,
  styles: [`
    .center { display:flex; justify-content:center; padding:40px; }
    .kpi-row { display:flex; gap:12px; }
    .kpi { flex:1; display:flex; flex-direction:column; }
    .kpi-lbl { font-size:12px; color:#718096; }
    .kpi-val { font-size:22px; font-weight:700; color:#1C4532; }
    .mora-box {
      display:flex; align-items:center; gap:8px; margin-top:12px;
      background:#FDE8E8; color:#9B1C1C; padding:10px; border-radius:8px; font-size:14px;
    }
    .offline-note { color:#92400E; font-size:14px; padding:8px; }
  `],
})
export class ClientDetailPage implements OnInit {
  readonly collection = inject(CollectionService);
  readonly network = inject(NetworkService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  client = signal<AssignedClient | null>(null);
  info = signal<PaymentInfo | null>(null);
  loadingInfo = signal(true);

  constructor() {
    addIcons({ cashOutline, walletOutline, alertCircleOutline, callOutline });
  }

  async ngOnInit() {
    const loanId = this.route.snapshot.paramMap.get('loanId')!;
    const c = this.collection.clients().find(x => x.loanId === loanId) || null;
    this.client.set(c);

    if (this.network.online()) {
      try {
        const info = await this.collection.getPaymentInfo(loanId);
        this.info.set(info);
      } catch { /* offline o error: se permite pago igual */ }
    }
    this.loadingInfo.set(false);
  }

  goPay() {
    this.router.navigate(['/payment', this.client()!.loanId]);
  }
}
