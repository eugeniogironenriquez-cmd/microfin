import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonIcon,
  IonSpinner, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonChip,
  IonSegment, IonSegmentButton,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  printOutline, bluetoothOutline, searchOutline, checkmarkCircle,
  trashOutline, refreshOutline, closeCircleOutline, resizeOutline,
} from 'ionicons/icons';

import { ThermalPrinterService, DiscoveredDevice } from '../../core/thermal-printer.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonIcon,
    IonSpinner, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonChip,
    IonSegment, IonSegmentButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/clients"></ion-back-button></ion-buttons>
        <ion-title>Ajustes</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">

      <!-- Impresora actual -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>
            <ion-icon name="print-outline"></ion-icon>
            Impresora de tickets
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          @if (printer.printer(); as p) {
            <ion-item lines="none" class="actual">
              <ion-icon name="checkmark-circle" color="success" slot="start"></ion-icon>
              <ion-label>
                <h3>{{ p.name || 'Impresora' }}</h3>
                <p>{{ p.address }}</p>
              </ion-label>
              <ion-chip slot="end" [color]="printer.connected() ? 'success' : 'medium'">
                {{ printer.connected() ? 'Conectada' : 'Guardada' }}
              </ion-chip>
            </ion-item>

            <!-- Ancho del papel (80mm o 58mm) -->
            <ion-item lines="none" class="ancho-papel">
              <ion-icon name="resize-outline" slot="start"></ion-icon>
              <ion-label>Ancho del papel</ion-label>
              <ion-segment slot="end" [value]="p.paperWidth || 80"
                           (ionChange)="cambiarAncho($event)">
                <ion-segment-button [value]="80">
                  <ion-label>80mm</ion-label>
                </ion-segment-button>
                <ion-segment-button [value]="58">
                  <ion-label>58mm</ion-label>
                </ion-segment-button>
              </ion-segment>
            </ion-item>

            <div class="acciones">
              <ion-button size="small" fill="outline" (click)="probar()" [disabled]="probando()">
                @if (probando()) { <ion-spinner name="crescent"></ion-spinner> }
                @else { <ion-icon slot="start" name="refresh-outline"></ion-icon> Probar impresión }
              </ion-button>
              <ion-button size="small" fill="outline" color="danger" (click)="olvidar()">
                <ion-icon slot="start" name="trash-outline"></ion-icon>
                Quitar
              </ion-button>
            </div>
          } @else {
            <p class="muted">
              <ion-icon name="bluetooth-outline"></ion-icon>
              No hay impresora configurada. Busca y selecciona una abajo.
            </p>
          }
        </ion-card-content>
      </ion-card>

      <!-- Buscar / emparejar -->
      <ion-card>
        <ion-card-content>
          <ion-button expand="block" (click)="buscar()" [disabled]="printer.scanning()">
            @if (printer.scanning()) {
              <ion-spinner name="crescent" slot="start"></ion-spinner>
              Buscando impresoras...
            } @else {
              <ion-icon slot="start" name="search-outline"></ion-icon>
              Buscar impresoras
            }
          </ion-button>

          @if (printer.scanning()) {
            <ion-button expand="block" fill="clear" size="small" (click)="detener()">
              <ion-icon slot="start" name="close-circle-outline"></ion-icon>
              Detener búsqueda
            </ion-button>
          }

          @if (printer.devices().length > 0) {
            <ion-list>
              <ion-list-header>Dispositivos encontrados</ion-list-header>
              @for (d of printer.devices(); track d.address) {
                <ion-item button (click)="seleccionar(d)">
                  <ion-icon name="bluetooth-outline" slot="start" color="primary"></ion-icon>
                  <ion-label>
                    <h3>{{ d.name || 'Dispositivo sin nombre' }}</h3>
                    <p>{{ d.address }}</p>
                  </ion-label>
                  @if (esActual(d)) {
                    <ion-icon name="checkmark-circle" color="success" slot="end"></ion-icon>
                  }
                </ion-item>
              }
            </ion-list>
          } @else if (!printer.scanning() && buscado()) {
            <ion-note class="empty">
              No se encontraron impresoras. Asegúrate de que esté encendida,
              emparejada en Bluetooth y cerca del teléfono.
            </ion-note>
          }
        </ion-card-content>
      </ion-card>

    </ion-content>
  `,
  styles: [`
    ion-card-title { display:flex; align-items:center; gap:8px; font-size:17px; }
    .actual { --background:#F0FFF4; border-radius:8px; margin-bottom:12px; }
    .acciones { display:flex; gap:8px; flex-wrap:wrap; }
    .muted {
      color:#718096; font-size:14px; display:flex; align-items:center;
      gap:8px; margin:0;
    }
    .empty { display:block; padding:12px 4px; color:#718096; font-size:13px; }
  `],
})
export class SettingsPage {
  readonly printer = inject(ThermalPrinterService);
  private toast = inject(ToastController);
  private router = inject(Router);

  probando = signal(false);
  buscado = signal(false);

  constructor() {
    addIcons({
      printOutline, bluetoothOutline, searchOutline, checkmarkCircle,
      trashOutline, refreshOutline, closeCircleOutline, resizeOutline,
    });
  }

  // Cambia el ancho del papel (58/80mm) y lo guarda en la impresora recordada.
  async cambiarAncho(ev: any) {
    const ancho = Number(ev?.detail?.value) === 58 ? 58 : 80;
    const actual = this.printer.printer();
    if (!actual) return;
    await this.printer.guardarImpresora({ ...actual, paperWidth: ancho as 58 | 80 });
    const t = await this.toast.create({
      message: `Ancho de papel: ${ancho}mm`,
      duration: 1500,
      position: 'bottom',
    });
    await t.present();
  }

  async buscar() {
    this.buscado.set(true);
    try {
      await this.printer.escanear();
    } catch {
      this.notify('No se pudo iniciar la búsqueda. Revisa los permisos de Bluetooth.');
    }
  }

  async detener() {
    await this.printer.detenerEscaneo();
  }

  async seleccionar(d: DiscoveredDevice) {
    await this.printer.detenerEscaneo();
    await this.printer.guardarImpresora({ address: d.address, name: d.name || 'Impresora' });
    // Intentar conectar de una vez para confirmar que funciona.
    const ok = await this.printer.conectar(d.address);
    this.notify(ok ? 'Impresora configurada y conectada' : 'Impresora guardada (no se pudo conectar ahora)');
  }

  esActual(d: DiscoveredDevice): boolean {
    return this.printer.printer()?.address === d.address;
  }

  async olvidar() {
    await this.printer.olvidarImpresora();
    this.notify('Impresora eliminada');
  }

  async probar() {
    this.probando.set(true);
    try {
      const ok = await this.printer.imprimirPrueba();
      this.notify(ok ? 'Impresión de prueba enviada' : 'No se pudo imprimir. Revisa la conexión.');
    } finally {
      this.probando.set(false);
    }
  }

  private async notify(message: string) {
    const t = await this.toast.create({ message, duration: 2400, position: 'bottom' });
    await t.present();
  }
}