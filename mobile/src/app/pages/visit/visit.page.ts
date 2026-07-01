import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonCard, IonCardContent, IonItem, IonLabel, IonInput, IonTextarea,
  IonButton, IonIcon, IonSpinner, IonSegment, IonSegmentButton, IonText,
  IonChip, IonDatetime, IonModal, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline, checkmarkCircle, personRemoveOutline, calendarOutline,
  cloudOfflineOutline, saveOutline,
} from 'ionicons/icons';

import { CollectionService } from '../../core/collection.service';
import { GeoService } from '../../core/geo.service';
import { NetworkService } from '../../core/network.service';
import { AssignedClient, TipoVisita } from '../../core/models';

@Component({
  selector: 'app-visit',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardContent, IonItem, IonLabel, IonInput, IonTextarea,
    IonButton, IonIcon, IonSpinner, IonSegment, IonSegmentButton, IonText,
    IonChip, IonDatetime, IonModal,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/clients"></ion-back-button></ion-buttons>
        <ion-title>Registrar visita</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (!done()) {
        <ion-card>
          <ion-card-content>
            <h2 class="cli">{{ client()?.customerName }}</h2>

            <!-- Tipo de visita -->
            <ion-label class="lbl">Resultado de la visita</ion-label>
            <ion-segment [(ngModel)]="tipo" value="NO_LOCALIZADO">
              <ion-segment-button value="NO_LOCALIZADO">
                <ion-label>No localizado</ion-label>
              </ion-segment-button>
              <!--<ion-segment-button value="PROMESA_PAGO">
                <ion-label>Promesa de pago</ion-label>
              </ion-segment-button>-->
            </ion-segment>

            <!-- Campos de promesa de pago -->
            @if (tipo === 'PROMESA_PAGO') {
              <ion-item>
                <ion-label position="stacked">Monto prometido</ion-label>
                <ion-input type="number" [(ngModel)]="montoPromesa" placeholder="0.00">
                  <span slot="start">$&nbsp;</span>
                </ion-input>
              </ion-item>

              <ion-item button (click)="dateModal = true">
                <ion-icon name="calendar-outline" slot="start" color="medium"></ion-icon>
                <ion-label>
                  <p>Fecha prometida</p>
                  <h3>{{ fechaPromesa ? (fechaPromesa | date:'dd/MM/yyyy') : 'Seleccionar fecha' }}</h3>
                </ion-label>
              </ion-item>

              <ion-modal [isOpen]="dateModal" (didDismiss)="dateModal = false">
                <ng-template>
                  <ion-content>
                    <ion-datetime
                      presentation="date"
                      [preferWheel]="true"
                      (ionChange)="onDate($event)">
                    </ion-datetime>
                  </ion-content>
                </ng-template>
              </ion-modal>
            }

            <!-- Notas -->
            <ion-item>
              <ion-label position="stacked">Notas {{ tipo === 'NO_LOCALIZADO' ? '' : '(opcional)' }}</ion-label>
              <ion-textarea [(ngModel)]="notas" [rows]="3"
                            placeholder="Describe lo que pasó en la visita..."></ion-textarea>
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
                  Sin conexión: la visita se guardará y sincronizará después.</p>
              </ion-text>
            }

            <ion-button expand="block" color="primary" (click)="submit()" [disabled]="saving()">
              @if (saving()) { <ion-spinner name="crescent"></ion-spinner> }
              @else { <ion-icon slot="start" name="save-outline"></ion-icon> Guardar visita }
            </ion-button>
          </ion-card-content>
        </ion-card>
      } @else {
        <div class="ok">
          <ion-icon name="checkmark-circle" color="success"></ion-icon>
          <h2>Visita registrada</h2>
          <p>{{ syncedNow() ? 'Sincronizada con el servidor' : 'Guardada — se sincronizará al recuperar conexión' }}</p>
        </div>
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
  `],
})
export class VisitPage implements OnInit {
  readonly collection = inject(CollectionService);
  readonly network = inject(NetworkService);
  private geoSvc = inject(GeoService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastController);

  client = signal<AssignedClient | null>(null);
  tipo: TipoVisita = 'NO_LOCALIZADO';
  notas = '';
  montoPromesa: number | null = null;
  fechaPromesa: string | null = null;
  dateModal = false;

  geo = signal<{ lat: number; lng: number } | null>(null);
  capturingGeo = signal(false);
  saving = signal(false);
  done = signal(false);
  syncedNow = signal(false);

  constructor() {
    addIcons({
      locationOutline, checkmarkCircle, personRemoveOutline, calendarOutline,
      cloudOfflineOutline, saveOutline,
    });
  }

  async ngOnInit() {
    const loanId = this.route.snapshot.paramMap.get('loanId')!;
    const c = this.collection.clients().find(x => x.loanId === loanId) || null;
    this.client.set(c);

    this.capturingGeo.set(true);
    const pos = await this.geoSvc.getCurrentPosition();
    this.geo.set(pos);
    this.capturingGeo.set(false);
  }

  onDate(ev: any) {
    const val = ev.detail.value;
    if (val) this.fechaPromesa = String(val).slice(0, 10); // 'YYYY-MM-DD'
    this.dateModal = false;
  }

  async submit() {
    if (this.tipo === 'PROMESA_PAGO') {
      if (!this.fechaPromesa) { this.notify('Selecciona la fecha prometida'); return; }
      if (!this.montoPromesa || this.montoPromesa <= 0) { this.notify('Ingresa el monto prometido'); return; }
    }
    this.saving.set(true);
    try {
      const visit = await this.collection.registerVisit({
        loanId: this.client()!.loanId,
        tipo: this.tipo,
        notas: this.notas || undefined,
        fechaPromesa: this.tipo === 'PROMESA_PAGO' ? this.fechaPromesa! : undefined,
        montoPromesa: this.tipo === 'PROMESA_PAGO' ? Number(this.montoPromesa) : undefined,
        lat: this.geo()?.lat,
        lng: this.geo()?.lng,
      });
      this.syncedNow.set(visit.synced);
      this.done.set(true);
    } catch (e: any) {
      this.notify(e?.error?.message || 'Error al registrar la visita');
    } finally {
      this.saving.set(false);
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
