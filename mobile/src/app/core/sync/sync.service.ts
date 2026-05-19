// ============================================================
// SYNC SERVICE - Sincronización automática cuando hay red
// ============================================================
import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Network } from '@capacitor/network';
import { firstValueFrom } from 'rxjs';
import { OfflineDbService } from '../db/offline-db.service';
import { MobileAuthService } from '../auth/auth.service';

export type SyncState = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

@Injectable({ providedIn: 'root' })
export class SyncService {
  readonly syncState = signal<SyncState>('idle');
  readonly pendingCount = signal(0);
  readonly lastSync = signal<Date | null>(null);

  private syncing = false;

  constructor(
    private http: HttpClient,
    private db: OfflineDbService,
    private auth: MobileAuthService,
  ) {
    this.initNetworkListener();
    this.refreshPendingCount();
  }

  private async initNetworkListener() {
    Network.addListener('networkStatusChange', async (status) => {
      if (status.connected) {
        console.log('[Sync] Red disponible, iniciando sincronización...');
        await this.sync();
      } else {
        this.syncState.set('offline');
      }
    });

    const status = await Network.getStatus();
    if (status.connected) this.syncState.set('idle');
    else this.syncState.set('offline');
  }

  async refreshPendingCount() {
    const count = await this.db.getPendingCount();
    this.pendingCount.set(count);
  }

  async sync(): Promise<{ success: boolean; synced: number; errors: number }> {
    if (this.syncing) return { success: false, synced: 0, errors: 0 };

    const status = await Network.getStatus();
    if (!status.connected) {
      this.syncState.set('offline');
      return { success: false, synced: 0, errors: 0 };
    }

    this.syncing = true;
    this.syncState.set('syncing');

    const [pendingPayments, pendingVisits] = await Promise.all([
      this.db.getPendingPayments(),
      this.db.getPendingVisits(),
    ]);

    if (pendingPayments.length === 0 && pendingVisits.length === 0) {
      this.syncState.set('idle');
      this.syncing = false;
      return { success: true, synced: 0, errors: 0 };
    }

    try {
      const headers = new HttpHeaders({
        Authorization: `Bearer ${this.auth.token()}`,
        'Content-Type': 'application/json',
      });

      const response = await firstValueFrom(
        this.http.post<any>(`${this.auth.getApiUrl()}/payments/sync`, {
          payments: pendingPayments,
          visits: pendingVisits,
        }, { headers }),
      );

      const data = response.data;
      let synced = 0;
      let errors = 0;

      // Marcar como sincronizados
      for (const result of data.payments || []) {
        if (result.status === 'SYNCED' || result.status === 'ALREADY_SYNCED') {
          await this.db.markPaymentSynced(result.localId);
          synced++;
        } else {
          errors++;
        }
      }

      for (const v of pendingVisits) {
        await this.db.markVisitSynced(v.localId);
        synced++;
      }

      await this.db.clearSynced();
      await this.refreshPendingCount();

      this.syncState.set('success');
      this.lastSync.set(new Date());
      this.syncing = false;
      return { success: true, synced, errors };

    } catch (err) {
      console.error('[Sync] Error:', err);
      this.syncState.set('error');
      this.syncing = false;
      return { success: false, synced: 0, errors: 1 };
    }
  }
}
