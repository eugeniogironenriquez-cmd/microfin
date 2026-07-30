import { Injectable, signal } from '@angular/core';
import { Network } from '@capacitor/network';

/**
 * Detecta el estado de conexión usando el plugin Network de Capacitor.
 * Expone una señal reactiva `online` que la UI puede consumir.
 *
 * Además, permite registrar un callback que se dispara cuando la conexión
 * se RECUPERA (pasa de offline a online). CollectionService lo usa para
 * sincronizar automáticamente los pendientes (pagos, visitas, seguimientos).
 */
@Injectable({ providedIn: 'root' })
export class NetworkService {
  readonly online = signal<boolean>(true);

  // Callback que se ejecuta al recuperar la conexión.
  private onReconnect: (() => void) | null = null;

  async init() {
    const status = await Network.getStatus();
    this.online.set(status.connected);

    Network.addListener('networkStatusChange', (status) => {
      const estabaOffline = !this.online();
      this.online.set(status.connected);

      // Solo dispara al pasar de offline → online (reconexión real).
      if (status.connected && estabaOffline && this.onReconnect) {
        this.onReconnect();
      }
    });
  }

  /** Registra el callback que se ejecuta al recuperar conexión. */
  registerReconnectHandler(handler: () => void) {
    this.onReconnect = handler;
  }

  async isOnline(): Promise<boolean> {
    const status = await Network.getStatus();
    this.online.set(status.connected);
    return status.connected;
  }
}