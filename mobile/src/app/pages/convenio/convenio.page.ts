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
import { documentTextOutline, checkmarkCircle, calendarOutline, cloudOfflineOutline, shareOutline, calculatorOutline } from 'ionicons/icons';

import { CollectionService } from '../../core/collection.service';
import { NetworkService } from '../../core/network.service';
import { DocumentsService } from '../../core/documents.service';
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

            <ion-item>
              <ion-label position="stacked">Cuota fija (opcional)</ion-label>
              <ion-input type="number" [(ngModel)]="customPayment" placeholder="Se reparte parejo si se deja vacío">
                <span slot="start">$&nbsp;</span>
              </ion-input>
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

            <!-- Vista previa del reparto (misma lógica del gestor: cuota fija
                 con último ajuste, o reparto parejo si no se fija cuota) -->
            @if (convenioPreview()) {
              <div class="sim-box">
                <div class="sim-row"><ion-icon name="calculator-outline"></ion-icon>
                  <span>{{ convenioPreview() }}</span>
                </div>
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

        @if (syncedNow() && nuevoLoanId()) {
          <div class="docs">
            <p class="docs-title">Documentos del convenio</p>

            <ion-button expand="block" fill="outline" (click)="verCalendario()"
                        [disabled]="docs.descargando()">
              @if (docs.descargando()) { <ion-spinner name="crescent"></ion-spinner> }
              @else { <ion-icon slot="start" name="calendar-outline"></ion-icon> }
              Calendario de pagos
            </ion-button>

            <ion-button expand="block" fill="outline" (click)="verConvenio()"
                        [disabled]="docs.descargando()">
              @if (docs.descargando()) { <ion-spinner name="crescent"></ion-spinner> }
              @else { <ion-icon slot="start" name="document-text-outline"></ion-icon> }
              Convenio
            </ion-button>

            <ion-button expand="block" fill="outline" color="success"
                        (click)="enviarWhatsApp()" [disabled]="docs.descargando()">
              <ion-icon slot="start" name="share-outline"></ion-icon>
              Enviar por WhatsApp
            </ion-button>
          </div>
        }

        <ion-button expand="block" (click)="finish()">Listo</ion-button>
      }
    </ion-content>
  `,
  styles: [`
    .cli { margin:0 0 4px; font-size:18px; font-weight:700; color:#1C4532; }
    .docs { margin: 16px 0; padding-top: 12px; border-top: 1px solid #e2e8f0; }
    .docs-title { font-size:13px; font-weight:600; color:#718096; text-transform:uppercase;
                  letter-spacing:.4px; margin:0 0 10px; text-align:center; }
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
  readonly docs = inject(DocumentsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastController);

  client = signal<AssignedClient | null>(null);
  montoConvenio: number | null = null;
  numeroPagos: number | null = null;
  periodicidad = 'SEMANAL';
  fechaPrimerPago: string | null = null;
  customPayment: number | null = null;
  notes = '';
  dateModal = false;

  saving = signal(false);
  done = signal(false);
  syncedNow = signal(false);
  // Id del crédito nuevo (convenio) creado en el servidor: permite descargar
  // sus documentos. Null si la acción quedó pendiente de sincronizar.
  nuevoLoanId = signal<string | null>(null);

  // Vista previa del reparto de cuotas. Refleja la misma lógica del backend/
  // gestor: si se fija una cuota, todos los pagos son de ese monto salvo el
  // último que absorbe la diferencia; si no, se reparte parejo.
  convenioPreview = computed(() => {
    const m = Number(this.montoConvenio || 0);
    const n = Math.round(Number(this.numeroPagos || 0));
    const custom = Number(this.customPayment || 0);
    if (m <= 0 || n <= 0) return '';

    const fmt = (x: number) =>
      x.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    if (custom > 0) {
      // Cuota fija: (n-1) pagos de 'custom' y el último absorbe el resto.
      if (n > 1 && custom * (n - 1) >= m) {
        return '⚠ La cuota es muy alta: la deuda se cubre antes del último pago.';
      }
      const ultimo = Math.round((m - custom * (n - 1)) * 100) / 100;
      if (n === 1) return `1 pago de ${fmt(m)}`;
      return `${n - 1} pagos de ${fmt(custom)} y el último de ${fmt(ultimo)}`;
    }

    // Reparto parejo: el último absorbe el redondeo.
    const cuota = Math.round((m / n) * 100) / 100;
    const ultimo = Math.round((m - cuota * (n - 1)) * 100) / 100;
    if (Math.abs(cuota - ultimo) < 0.005) return `${n} pagos de ${fmt(cuota)}`;
    return `${n - 1} pagos de ${fmt(cuota)} y el último de ${fmt(ultimo)}`;
  });

  constructor() {
    addIcons({ documentTextOutline, checkmarkCircle, calendarOutline, cloudOfflineOutline, shareOutline, calculatorOutline });
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

    // Si se fijó cuota, validar que no cubra la deuda antes del último pago.
    const custom = Number(this.customPayment || 0);
    const n = Math.round(Number(this.numeroPagos));
    if (custom > 0 && n > 1 && custom * (n - 1) >= Number(this.montoConvenio)) {
      this.notify('La cuota fija es muy alta: reduce la cuota o el número de pagos');
      return;
    }

    this.saving.set(true);
    try {
      const accion = await this.collection.registrarGestorAccion('CONVENIO', this.client()!.loanId, {
        montoConvenio: Number(this.montoConvenio),
        numeroPagos: Number(this.numeroPagos),
        periodicidad: this.periodicidad,
        fechaPrimerPago: this.fechaPrimerPago,
        customPayment: custom > 0 ? custom : undefined,
        notes: this.notes || undefined,
      });
      this.syncedNow.set(accion.synced);
      // Guardar el id del crédito nuevo (convenio) para poder descargar sus
      // documentos. Solo existe si la acción se aplicó en el servidor.
      this.nuevoLoanId.set(accion.serverId || null);
      this.done.set(true);
    } catch (e: any) {
      this.notify(e?.error?.message || 'Error al generar el convenio');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Documentos del convenio ────────────────────────────────
  async verCalendario() {
    const id = this.nuevoLoanId();
    if (!id) return;
    try {
      await this.docs.abrirCalendario(id);
    } catch {
      this.notify('No se pudo abrir el calendario de pagos');
    }
  }

  async verConvenio() {
    const id = this.nuevoLoanId();
    if (!id) return;
    try {
      await this.docs.abrirConvenio(id);
    } catch {
      this.notify('No se pudo abrir el convenio');
    }
  }

  async enviarWhatsApp() {
    const id = this.nuevoLoanId();
    if (!id) return;
    try {
      await this.docs.compartirWhatsApp(
        id,
        'calendario',
        this.client()?.phone,
        this.client()?.customerName,
      );
    } catch {
      this.notify('No se pudo compartir el documento');
    }
  }

  finish() { this.router.navigate(['/clients'], { replaceUrl: true }); }

  private async notify(message: string) {
    const t = await this.toast.create({ message, duration: 2400, position: 'bottom' });
    await t.present();
  }
}