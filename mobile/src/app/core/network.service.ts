import { Injectable, signal } from '@angular/core';
import { Network } from '@capacitor/network';

/**
 * Detecta el estado de conexión usando el plugin Network de Capacitor.
 * Expone una señal reactiva `online` que la UI puede consumir.
 */
@Injectable({ providedIn: 'root' })
export class NetworkService {
  readonly online = signal<boolean>(true);

  async init() {
    const status = await Network.getStatus();
    this.online.set(status.connected);

    Network.addListener('networkStatusChange', (status) => {
      this.online.set(status.connected);
    });
  }

  async isOnline(): Promise<boolean> {
    const status = await Network.getStatus();
    this.online.set(status.connected);
    return status.connected;
  }
}
