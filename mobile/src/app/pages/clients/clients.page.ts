import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem,
  IonLabel, IonBadge, IonIcon, IonButton, IonButtons, IonSearchbar,
  IonRefresher, IonRefresherContent, IonSpinner, IonNote, IonChip,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  logOutOutline, cloudUploadOutline, syncOutline, personCircleOutline,
  checkmarkCircle, alertCircle, chevronForward, refreshOutline,
} from 'ionicons/icons';

import { AuthService } from '../../core/auth.service';
import { CollectionService } from '../../core/collection.service';
import { NetworkService } from '../../core/network.service';
import { AssignedClient } from '../../core/models';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem,
    IonLabel, IonBadge, IonIcon, IonButton, IonButtons, IonSearchbar,
    IonRefresher, IonRefresherContent, IonSpinner, IonNote, IonChip,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Mis clientes</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="sync()" [disabled]="collection.syncing()">
            @if (collection.syncing()) { <ion-spinner name="crescent"></ion-spinner> }
            @else {
              <ion-icon slot="icon-only" name="sync-outline"></ion-icon>
            }
          </ion-button>
          <ion-button (click)="logout()">
            <ion-icon slot="icon-only" name="log-out-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- Barra de estado de sincronización -->
      @if (collection.pendingCount() > 0) {
        <ion-chip color="warning" class="sync-chip" (click)="sync()">
          <ion-icon name="cloud-upload-outline"></ion-icon>
          <ion-label>{{ collection.pendingCount() }} pago(s) por sincronizar</ion-label>
        </ion-chip>
      }

      <ion-searchbar placeholder="Buscar cliente..." [debounce]="200"
                     (ionInput)="onSearch($event)"></ion-searchbar>

      @if (loading()) {
        <div class="center"><ion-spinner name="crescent"></ion-spinner></div>
      } @else if (filtered().length === 0) {
        <div class="empty">
          <ion-icon name="person-circle-outline"></ion-icon>
          <p>No hay clientes asignados.</p>
          <ion-button fill="outline" (click)="download()">
            <ion-icon slot="start" name="refresh-outline"></ion-icon>
            Descargar clientes
          </ion-button>
        </div>
      } @else {
        <ion-list>
          @for (c of filtered(); track c.loanId) {
            <ion-item button (click)="open(c)">
              <ion-icon
                [name]="c.estado === 'vencido' ? 'alert-circle' : 'checkmark-circle'"
                [color]="c.estado === 'vencido' ? 'danger' : 'success'"
                slot="start"></ion-icon>
              <ion-label>
                <h2>{{ c.customerName }}</h2>
                <p>Cuota: {{ c.periodicPayment | currency:'MXN':'symbol':'1.0-0' }} · {{ c.phone || 's/tel' }}</p>
              </ion-label>
              <ion-badge slot="end" [class]="c.estado === 'vencido' ? 'estado-vencido' : 'estado-corriente'">
                {{ c.estado === 'vencido' ? 'Vencido' : 'Al corriente' }}
              </ion-badge>
              <ion-icon name="chevron-forward" slot="end" color="medium"></ion-icon>
            </ion-item>
          }
        </ion-list>
        <ion-note class="foot-note">
          {{ filtered().length }} cliente(s) · Última descarga en cache
        </ion-note>
      }
    </ion-content>
  `,
  styles: [`
    .center { display:flex; justify-content:center; padding:40px; }
    .empty { text-align:center; padding:48px 24px; color:#718096; }
    .empty ion-icon { font-size:64px; color:#CBD5E0; }
    .empty p { margin:12px 0 20px; }
    .sync-chip { margin:10px 12px 0; }
    .foot-note { display:block; text-align:center; padding:16px; font-size:12px; }
  `],
})
export class ClientsPage implements OnInit {
  readonly collection = inject(CollectionService);
  readonly network = inject(NetworkService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastController);

  loading = signal(true);
  search = signal('');

  filtered = computed(() => {
    const term = this.search().toLowerCase().trim();
    const list = this.collection.clients();
    if (!term) return list;
    return list.filter(c =>
      c.customerName.toLowerCase().includes(term) ||
      (c.phone || '').includes(term)
    );
  });

  constructor() {
    addIcons({
      logOutOutline, cloudUploadOutline, syncOutline, personCircleOutline,
      checkmarkCircle, alertCircle, chevronForward, refreshOutline,
    });
  }

  async ngOnInit() {
    // Mostrar cache primero (offline-first), luego intentar refrescar
    await this.collection.loadFromCache();
    this.loading.set(false);
    if (this.network.online()) {
      await this.download(true);
    }
  }

  async download(silent = false) {
    if (!this.network.online()) {
      if (!silent) this.notify('Sin conexión — mostrando datos guardados');
      return;
    }
    try {
      await this.collection.downloadClients();
      if (!silent) this.notify('Clientes actualizados');
    } catch {
      if (!silent) this.notify('No se pudo descargar');
    }
  }

  async doRefresh(ev: any) {
    await this.download();
    ev.target.complete();
  }

  async sync() {
    if (!this.network.online()) { this.notify('Sin conexión'); return; }
    const r = await this.collection.syncPending();
    this.notify(`Sincronizados: ${r.ok}` + (r.fail ? ` · Fallidos: ${r.fail}` : ''));
    await this.download(true);
  }

  onSearch(ev: any) { this.search.set(ev.target.value || ''); }

  open(c: AssignedClient) {
    this.router.navigate(['/client', c.loanId]);
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/login'], { replaceUrl: true });
  }

  private async notify(message: string) {
    const t = await this.toast.create({ message, duration: 2200, position: 'bottom' });
    await t.present();
  }
}
