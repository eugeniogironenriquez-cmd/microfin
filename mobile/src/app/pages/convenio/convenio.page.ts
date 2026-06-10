import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonCard, IonCardContent, IonItem, IonLabel, IonInput, IonTextarea,
  IonSelect, IonSelectOption, IonButton, IonIcon, IonSpinner, IonText,
  IonModal, IonDatetime, IonNote, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { documentTextOutline, checkmarkCircle, calendarOutline, cloudOfflineOutline } from 'ionicons/icons';

import { CollectionService } from '../../core/collection.service';
import { NetworkService } from '../../core/network.service';
import { AssignedClient } from '../../core/models';

@Component({
  selector: 'app-convenio',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardContent, IonItem, IonLabel, IonInput, IonTextarea,
    IonSelect, IonSelectOption, IonButton, IonIcon, IonSpinner, IonText,
    IonModal, IonDatetime, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/clients"></ion-back-button></ion-buttons>
        <ion-title>Convenio de pago</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (!done()) {
        <ion-card>
          <ion-card-content>
            <h2 class="cli">{{ client()?.customerName }}</h2>
            <p class="muted">Plan de pago sin intereses. El crédito actual quedará archivado y se generará el convenio.</p>

            <ion-item>
              <ion-label position="stacked">Monto del convenio</ion-label>
              <ion-input type="number" [(ngModel)]="montoConvenio">
                <span slot="start">$&nbsp;</span>
              </ion-input>
            </ion-item>

            <ion-item>
              <ion-label position="stacked">Número de pagos</ion-label>
              <ion-input type="number" [(ngModel)]="numeroPagos"></ion-input>
            </ion-item>

            <ion-item>
              <ion-label position="stacked">Periodicidad</ion-label>
              <ion-select [(ngModel)]="periodicidad" interface="action-sheet" value="SEMANAL">
                <ion-select-option value="DIARIO">Diario (L-V)</ion-select-option>
                <ion-select-option value="SEMANAL">Semanal</ion-select-option>
                <ion-select-option value="QUINCENAL">Quincenal</ion-select-option>
                <ion-select-option value="MENSUAL">Mensual</ion-select-option>
              </ion-select>
            </ion-item>

            <ion-item button (click)="dateModal = true">
              <ion-icon name="calendar-outline" slot="start" color="medium"></ion-icon>
              <ion-label>
                <p>Fecha del primer pago</p>
                <h3>{{ fechaPrimerPago ? (fechaPrimerPago | date:'dd/MM/yyyy') : 'Seleccionar fecha' }}</h3>
              </ion-label>
            </ion-item>

            <ion-modal [isOpen]="dateModal" (didDismiss)="dateModal = false">
              <ng-template>
                <ion-content>
                  <ion-datetime presentation="date" [preferWheel]="true" (ionChange)="onDate($event)"></ion-datetime>
                </ion-content>
              </ng-template>
            </ion-modal>

            <ion-item>
              <ion-label position="stacked">Notas (opcional)</ion-label>
              <ion-textarea [(ngModel)]="notes" [rows]="2"></ion-textarea>
            </ion-item>

            <!-- Cuota estimada (cálculo local simple: monto / pagos) -->
            @if (cuotaEstimada() > 0) {
              <div class="sim-box">
                <div class="sim-row"><span>Cuota por pago</span><strong>{{ cuotaEstimada() | currency:'MXN' }}</strong></div>
                <ion-note>{{ numeroPagos }} pagos {{ periodicidadLabel() }}</ion-note>
              </div>
            }

            @if (!network.online()) {
              <ion-text color="warning">
                <p class="hint"><ion-icon name="cloud-offline-outline"></ion-icon>
                  Sin conexión: el convenio se aplicará al sincronizar.</p>
              </ion-text>
            }

            <ion-button expand="block" color="primary" (click)="submit()" [disabled]="saving()">
              @if (saving()) { <ion-spinner name="crescent"></ion-spinner> }
              @else { <ion-icon slot="start" name="document-text-outline"></ion-icon> Generar convenio }
            </ion-button>
          </ion-card-content>
        </ion-card>
      } @else {
        <div class="ok">
          <ion-icon name="checkmark-circle" color="success"></ion-icon>
          <h2>Convenio registrado</h2>
          <p>{{ syncedNow() ? 'Aplicado en el servidor' : 'Se aplicará al recuperar conexión' }}</p>
        </div>
        <ion-button expand="block" (click)="finish()">Listo</ion-button>
      }
    </ion-content>
  `,
  styles: [`
    .cli { margin:0 0 4px; font-size:18px; font-weight:700; color:#1C4532; }
    .muted { color:#718096; font-size:13px; margin:0 0 8px; }
    .hint { font-size:13px; display:flex; align-items:center; gap:6px; }
    .sim-box { background:#F7FAFC; border-radius:10px; padding:12px 14px; margin:12px 0; }
    .sim-row { display:flex; justify-content:space-between; margin-bottom:4px; }
    .sim-row strong { color:#1C4532; }
    .ok { text-align:center; padding:24px 0 8px; }
    .ok ion-icon { font-size:64px; }
    .ok h2 { margin:8px 0 4px; }
    .ok p { color:#718096; font-size:14px; margin:0; }
  `],
})
export class ConvenioPage implements OnInit {
  readonly collection = inject(CollectionService);
  readonly network = inject(NetworkService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastController);

  client = signal<AssignedClient | null>(null);
  montoConvenio: number | null = null;
  numeroPagos: number | null = null;
  periodicidad = 'SEMANAL';
  fechaPrimerPago: string | null = null;
  notes = '';
  dateModal = false;

  saving = signal(false);
  done = signal(false);
  syncedNow = signal(false);

  cuotaEstimada = computed(() => {
    const m = Number(this.montoConvenio); const n = Number(this.numeroPagos);
    if (m > 0 && n > 0) return Math.round((m / n) * 100) / 100;
    return 0;
  });

  constructor() {
    addIcons({ documentTextOutline, checkmarkCircle, calendarOutline, cloudOfflineOutline });
  }

  ngOnInit() {
    const loanId = this.route.snapshot.paramMap.get('loanId')!;
    const c = this.collection.clients().find(x => x.loanId === loanId) || null;
    this.client.set(c);
  }

  periodicidadLabel(): string {
    return { DIARIO: 'diarios (L-V)', SEMANAL: 'semanales', QUINCENAL: 'quincenales', MENSUAL: 'mensuales' }[this.periodicidad] || '';
  }

  onDate(ev: any) {
    const val = ev.detail.value;
    if (val) this.fechaPrimerPago = String(val).slice(0, 10);
    this.dateModal = false;
  }

  async submit() {
    if (!this.montoConvenio || this.montoConvenio <= 0) { this.notify('Ingresa el monto del convenio'); return; }
    if (!this.numeroPagos || this.numeroPagos <= 0) { this.notify('Ingresa el número de pagos'); return; }
    if (!this.fechaPrimerPago) { this.notify('Selecciona la fecha del primer pago'); return; }

    this.saving.set(true);
    try {
      const accion = await this.collection.registrarGestorAccion('CONVENIO', this.client()!.loanId, {
        montoConvenio: Number(this.montoConvenio),
        numeroPagos: Number(this.numeroPagos),
        periodicidad: this.periodicidad,
        fechaPrimerPago: this.fechaPrimerPago,
        notes: this.notes || undefined,
      });
      this.syncedNow.set(accion.synced);
      this.done.set(true);
    } catch (e: any) {
      this.notify(e?.error?.message || 'Error al generar el convenio');
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
