import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonIcon,
  IonSpinner, IonItem, IonLabel, IonBadge, IonAccordion, IonAccordionGroup,
  IonSelect, IonSelectOption, IonTextarea, IonList, IonNote, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cashOutline, walletOutline, alertCircleOutline, callOutline, walkOutline,
  refreshOutline, documentTextOutline, calendarNumberOutline, locationOutline,
  navigateOutline, idCardOutline, peopleOutline, chatbubblesOutline, addOutline,
  cloudOfflineOutline, personOutline, timeOutline,
} from 'ionicons/icons';

import { CollectionService } from '../../core/collection.service';
import { NetworkService } from '../../core/network.service';
import { AuthService } from '../../core/auth.service';
import { MobilePermissionsService } from '../../services/mobile-permissions.service';
import { AssignedClient, PaymentInfo, LocalVisit } from '../../core/models';

interface SeguimientoItem {
  tipo: string;
  notas?: string;
  fecha: string;
  pendiente: boolean;
}

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonIcon,
    IonSpinner, IonItem, IonLabel, IonBadge, IonAccordion, IonAccordionGroup,
    IonSelect, IonSelectOption, IonTextarea, IonList, IonNote,
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
              <ion-badge slot="end" [class]="estadoBadge(client()!.estado)">
                {{ estadoLabel(client()!.estado) }}
              </ion-badge>
            </ion-item>

            <!-- Domicilio del cliente -->
            @if (domicilio()) {
              <ion-item lines="none" class="domicilio">
                <ion-icon name="location-outline" slot="start" color="medium"></ion-icon>
                <ion-label class="ion-text-wrap">
                  <p class="dom-line">{{ domicilio() }}</p>
                  @if (client()!.addressFull?.references) {
                    <p class="dom-ref">Ref: {{ client()!.addressFull!.references }}</p>
                  }
                </ion-label>
                <ion-button slot="end" fill="clear" size="small" (click)="abrirMapa()">
                  <ion-icon slot="icon-only" name="navigate-outline"></ion-icon>
                </ion-button>
              </ion-item>
            }
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

        <!-- Acordeones: Aval y Seguimiento -->
        <ion-accordion-group>
          <!-- AVAL -->
          <ion-accordion value="aval">
            <ion-item slot="header" color="light">
              <ion-icon name="people-outline" slot="start" color="primary"></ion-icon>
              <ion-label>Datos del aval</ion-label>
            </ion-item>
            <div slot="content" class="acc-body">
              @if (loadingAval()) {
                <div class="center-sm"><ion-spinner name="crescent"></ion-spinner></div>
              } @else if (aval(); as av) {
                <ion-item lines="none">
                  <ion-icon name="person-outline" slot="start" color="medium"></ion-icon>
                  <ion-label class="ion-text-wrap">{{ av.fullName }}</ion-label>
                </ion-item>
                @if (av.relationship) {
                  <ion-item lines="none">
                    <ion-label class="sub">Parentesco: {{ av.relationship }}</ion-label>
                  </ion-item>
                }
                @if (av.phone) {
                  <ion-item lines="none" button (click)="llamar(av.phone)">
                    <ion-icon name="call-outline" slot="start" color="medium"></ion-icon>
                    <ion-label>{{ av.phone }}</ion-label>
                  </ion-item>
                }
                @if (av.address) {
                  <ion-item lines="none">
                    <ion-icon name="location-outline" slot="start" color="medium"></ion-icon>
                    <ion-label class="ion-text-wrap">{{ av.address }}</ion-label>
                  </ion-item>
                }
              } @else if (!network.online()) {
                <p class="offline-note"><ion-icon name="cloud-offline-outline"></ion-icon> Sin conexión: el aval se carga en línea.</p>
              } @else {
                <p class="muted">Este crédito no tiene aval registrado.</p>
              }
            </div>
          </ion-accordion>

          <!-- SEGUIMIENTO -->
          <ion-accordion value="seguimiento">
            <ion-item slot="header" color="light">
              <ion-icon name="chatbubbles-outline" slot="start" color="primary"></ion-icon>
              <ion-label>Seguimiento</ion-label>
              @if (seguimientos().length > 0) {
                <ion-badge slot="end" color="medium">{{ seguimientos().length }}</ion-badge>
              }
            </ion-item>
            <div slot="content" class="acc-body">
              <!-- Captura -->
              <ion-item>
                <ion-select label="Tipo" [(ngModel)]="segTipo" interface="action-sheet" placeholder="Elegir">
                  <ion-select-option value="LLAMADA">Llamada</ion-select-option>
                  <ion-select-option value="MENSAJE">Mensaje</ion-select-option>
                  <ion-select-option value="VISITA">Visita</ion-select-option>
                  <ion-select-option value="OTRO">Otro</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-textarea label="Nota" labelPlacement="stacked" [(ngModel)]="segNota"
                              placeholder="¿Qué pasó en este contacto?" [rows]="2"></ion-textarea>
              </ion-item>
              <ion-button expand="block" size="small" (click)="guardarSeguimiento()" [disabled]="savingSeg()">
                @if (savingSeg()) { <ion-spinner name="crescent"></ion-spinner> }
                @else { <span><ion-icon slot="start" name="add-outline"></ion-icon> Registrar contacto</span> }
              </ion-button>

              <!-- Historial -->
              <div class="hist-title">Contactos previos</div>
              @if (loadingSeg()) {
                <div class="center-sm"><ion-spinner name="crescent"></ion-spinner></div>
              } @else if (seguimientos().length === 0) {
                <p class="muted">Sin contactos registrados aún.</p>
              } @else {
                <ion-list>
                  @for (s of seguimientos(); track $index) {
                    <ion-item lines="full">
                      <ion-label class="ion-text-wrap">
                        <div class="seg-head">
                          <ion-badge [class]="'seg-' + s.tipo.toLowerCase()">{{ tipoLabel(s.tipo) }}</ion-badge>
                          <span class="seg-fecha">{{ s.fecha }}</span>
                          @if (s.pendiente) {
                            <ion-note class="seg-pend"><ion-icon name="cloud-offline-outline"></ion-icon> por sincronizar</ion-note>
                          }
                        </div>
                        @if (s.notas) { <p class="seg-nota">{{ s.notas }}</p> }
                      </ion-label>
                    </ion-item>
                  }
                </ion-list>
              }
            </div>
          </ion-accordion>
        </ion-accordion-group>

        <!-- Acciones básicas (cobrador y gestor) -->
        @if (mp.puedeRegistrarPago()) {
          <ion-button expand="block" color="primary" (click)="goPay()">
            <ion-icon slot="start" name="cash-outline"></ion-icon>
            Registrar pago
          </ion-button>
        }
        @if (mp.puedeRegistrarVisita()) {
          <ion-button expand="block" fill="outline" color="secondary" (click)="goVisit()">
            <ion-icon slot="start" name="walk-outline"></ion-icon>
            Registrar visita
          </ion-button>
        }

        <!-- Acciones de gestor: cada una con su propio permiso -->
        @if (mp.puedePromesaPago()) {
          <ion-button expand="block" fill="outline" (click)="goPromesa()">
            <ion-icon slot="start" name="calendar-number-outline"></ion-icon>
            Promesa de pago
          </ion-button>
        }
        @if (mp.puedeConvenio()) {
          <ion-button expand="block" fill="outline" color="warning" (click)="goConvenio()">
            <ion-icon slot="start" name="document-text-outline"></ion-icon>
            Convenio de pago
          </ion-button>
        }
        @if (mp.puedeReestructura()) {
          <ion-button expand="block" fill="outline" (click)="goRestructure()">
            <ion-icon slot="start" name="refresh-outline"></ion-icon>
            Reestructurar
          </ion-button>
        }
      } @else {
        <div class="center"><ion-spinner name="crescent"></ion-spinner></div>
      }
    </ion-content>
  `,
  styles: [`
    .center { display:flex; justify-content:center; padding:40px; }
    .center-sm { display:flex; justify-content:center; padding:16px; }
    .kpi-row { display:flex; gap:12px; }
    .kpi { flex:1; display:flex; flex-direction:column; }
    .kpi-lbl { font-size:12px; color:#718096; }
    .kpi-val { font-size:22px; font-weight:700; color:#1C4532; }
    .mora-box {
      display:flex; align-items:center; gap:8px; margin-top:12px;
      background:#FDE8E8; color:#9B1C1C; padding:10px; border-radius:8px; font-size:14px;
    }
    .offline-note { color:#92400E; font-size:14px; padding:8px; display:flex; align-items:center; gap:6px; }
    .muted { color:#718096; font-size:14px; padding:8px; }
    .domicilio .dom-line { font-size:14px; color:#2D3748; margin:0; }
    .domicilio .dom-ref { font-size:12px; color:#718096; margin:2px 0 0; }
    .estado-atrasado { --background:#FEF3C7; --color:#92400E; background:#FEF3C7; color:#92400E; }
    .acc-body { padding:8px 12px 16px; }
    .sub { font-size:13px; color:#718096; }
    .hist-title { font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:#a0aec0; font-weight:600; margin:16px 0 8px; }
    .seg-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .seg-fecha { font-size:12px; color:#a0aec0; }
    .seg-pend { font-size:11px; color:#92400E; display:inline-flex; align-items:center; gap:3px; }
    .seg-nota { font-size:14px; color:#2D3748; margin:4px 0 0; }
    ion-badge.seg-llamada { --background:#dbeafe; --color:#1e40af; }
    ion-badge.seg-mensaje { --background:#dcfce7; --color:#166534; }
    ion-badge.seg-visita  { --background:#fef3c7; --color:#92400e; }
    ion-badge.seg-otro    { --background:#f3e8ff; --color:#6b21a8; }
  `],
})
export class ClientDetailPage implements OnInit {
  readonly collection = inject(CollectionService);
  readonly network = inject(NetworkService);
  readonly auth = inject(AuthService);
  readonly mp = inject(MobilePermissionsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastController);

  client = signal<AssignedClient | null>(null);
  info = signal<PaymentInfo | null>(null);
  loadingInfo = signal(true);

  aval = signal<any | null>(null);
  loadingAval = signal(true);

  seguimientos = signal<SeguimientoItem[]>([]);
  loadingSeg = signal(true);
  savingSeg = signal(false);
  segTipo: string = 'LLAMADA';
  segNota: string = '';

  constructor() {
    addIcons({
      cashOutline, walletOutline, alertCircleOutline, callOutline, walkOutline,
      refreshOutline, documentTextOutline, calendarNumberOutline, locationOutline,
      navigateOutline, idCardOutline, peopleOutline, chatbubblesOutline, addOutline,
      cloudOfflineOutline, personOutline, timeOutline,
    });
  }

  domicilio(): string | null {
    const c = this.client();
    if (!c) return null;
    if (c.addressLine) return c.addressLine;
    const a = c.addressFull;
    if (a) {
      const line = [a.street, a.colonia, a.municipality].filter(Boolean).join(', ');
      return line || null;
    }
    return c.address || null;
  }

  estadoBadge(estado: string): string {
    if (estado === 'vencido') return 'estado-vencido';
    if (estado === 'atrasado') return 'estado-atrasado';
    return 'estado-corriente';
  }
  estadoLabel(estado: string): string {
    if (estado === 'vencido') return 'Vencido';
    if (estado === 'atrasado') return 'Atrasado';
    return 'Al corriente';
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

    // Cargar aval (solo con conexión) y seguimientos (servidor + locales)
    this.cargarAval(loanId);
    this.cargarSeguimientos(loanId);
  }

  private async cargarAval(loanId: string) {
    this.loadingAval.set(true);
    if (this.network.online()) {
      const av = await this.collection.getAval(loanId);
      this.aval.set(av);
    }
    this.loadingAval.set(false);
  }

  private async cargarSeguimientos(loanId: string) {
    this.loadingSeg.set(true);
    const items: SeguimientoItem[] = [];

    // Locales pendientes (offline) primero
    const locales = await this.collection.getSeguimientosLocales(loanId);
    for (const v of locales) {
      if (this.esSeguimiento(v.tipo)) {
        items.push({ tipo: v.tipo, notas: v.notas || undefined, fecha: this.fmt(v.capturedAt), pendiente: true });
      }
    }

    // Del servidor (si hay conexión)
    if (this.network.online()) {
      const serv = await this.collection.getSeguimientosServidor(loanId);
      for (const v of serv) {
        if (this.esSeguimiento(v.tipo)) {
          items.push({ tipo: v.tipo, notas: v.notas || undefined, fecha: this.fmt(v.creadoEn), pendiente: false });
        }
      }
    }

    this.seguimientos.set(items);
    this.loadingSeg.set(false);
  }

  private esSeguimiento(tipo: string): boolean {
    return ['LLAMADA', 'MENSAJE', 'VISITA', 'OTRO'].includes(tipo);
  }

  async guardarSeguimiento() {
    if (!this.segTipo) { this.notify('Elige un tipo de contacto'); return; }
    this.savingSeg.set(true);
    try {
      await this.collection.registerVisit({
        loanId: this.client()!.loanId,
        tipo: this.segTipo as any,
        notas: this.segNota || undefined,
      });
      this.segNota = '';
      this.notify('Contacto registrado');
      await this.cargarSeguimientos(this.client()!.loanId);
    } catch {
      this.notify('No se pudo registrar');
    } finally {
      this.savingSeg.set(false);
    }
  }

  private fmt(iso: string): string {
    try {
      return new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(iso)).replace(',', '');
    } catch { return iso; }
  }

  tipoLabel(t: string): string {
    return { LLAMADA: 'Llamada', MENSAJE: 'Mensaje', VISITA: 'Visita', OTRO: 'Otro' }[t] || t;
  }

  llamar(phone: string) {
    window.open(`tel:${phone}`, '_system');
  }

  private async notify(message: string) {
    const t = await this.toast.create({ message, duration: 2200, position: 'bottom' });
    await t.present();
  }

  abrirMapa() {
    const dom = this.domicilio();
    if (!dom) return;
    const query = encodeURIComponent(dom);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_system');
  }

  goPay() { this.router.navigate(['/payment', this.client()!.loanId]); }
  goVisit() { this.router.navigate(['/visit', this.client()!.loanId]); }
  goPromesa() { this.router.navigate(['/promesa', this.client()!.loanId]); }
  goConvenio() { this.router.navigate(['/convenio', this.client()!.loanId]); }
  goRestructure() { this.router.navigate(['/restructure', this.client()!.loanId]); }
}