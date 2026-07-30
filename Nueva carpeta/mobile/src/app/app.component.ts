import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { App as CapApp } from '@capacitor/app';

import { NetworkService } from './core/network.service';
import { AuthService } from './core/auth.service';
import { CollectionService } from './core/collection.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, IonApp, IonRouterOutlet],
  template: `
    @if (!network.online()) {
      <div class="offline-banner">Sin conexión — trabajando en modo offline</div>
    }
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent implements OnInit {
  readonly network = inject(NetworkService);
  private auth = inject(AuthService);
  private collection = inject(CollectionService);

  async ngOnInit() {
    await this.network.init();
    await this.auth.loadSession();
    await this.collection.refreshPendingCount();

    // Sincronización automática al recuperar conexión
    let prevOnline = this.network.online();
    setInterval(async () => {
      const now = this.network.online();
      if (now && !prevOnline) {
        // Acaba de volver la conexión → sincronizar pendientes
        await this.collection.syncPending();
      }
      prevOnline = now;
    }, 4000);

    // Sincronizar también cuando la app vuelve a primer plano
    CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (isActive && this.network.online()) {
        await this.collection.syncPending();
      }
    });
  }
}
