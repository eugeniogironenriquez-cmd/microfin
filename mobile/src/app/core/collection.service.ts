import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { StorageService } from './storage.service';
import { NetworkService } from './network.service';
import { AssignedClient, LocalPayment, PaymentInfo, LocalVisit, TipoVisita } from './models';

interface ApiEnvelope<T> { success: boolean; data: T; timestamp: string; }

/**
 * Servicio central de cobranza:
 *  - Descarga y cachea los clientes asignados (offline)
 *  - Obtiene info de pago (cuota, saldo, mora)
 *  - Encola pagos localmente y los sincroniza cuando hay red
 */
@Injectable({ providedIn: 'root' })
export class CollectionService {
  private http = inject(HttpClient);
  private storage = inject(StorageService);
  private network = inject(NetworkService);
  private readonly base = environment.apiUrl;

  readonly clients = signal<AssignedClient[]>([]);
  readonly syncing = signal<boolean>(false);
  readonly pendingCount = signal<number>(0);

  // ── Clientes asignados ─────────────────────────────────────
  /** Carga desde cache local (uso inmediato / offline). */
  async loadFromCache() {
    const cached = await this.storage.getClients();
    this.clients.set(cached);
    await this.refreshPendingCount();
  }

  /** Descarga del servidor y actualiza la cache. Requiere conexión. */
  async downloadClients(): Promise<AssignedClient[]> {
    const res = await firstValueFrom(
      this.http.get<ApiEnvelope<any> | any>(`${this.base}/collection/my-clients`)
    );
    const raw = this.unwrap(res);
    const list: AssignedClient[] = (Array.isArray(raw) ? raw : []).map((l: any) => this.mapClient(l));
    this.clients.set(list);
    await this.storage.setClients(list);
    return list;
  }

  private mapClient(l: any): AssignedClient {
    const status = l.status || l.estatus || 'ACTIVO';
    return {
      loanId:          l.id || l.loanId,
      customerId:      l.customerId || l.customer?.id,
      customerName:    l.customer?.fullName || l.customerName || 'Cliente',
      phone:           l.customer?.phone || l.phone,
      address:         l.customer?.address?.street || l.address,
      principalAmount: Number(l.principalAmount || 0),
      periodicPayment: Number(l.periodicPayment || 0),
      status,
      estado:          status === 'VENCIDO' ? 'vencido' : 'corriente',
    };
  }

  // ── Info de pago ───────────────────────────────────────────
  async getPaymentInfo(loanId: string): Promise<PaymentInfo> {
    const res = await firstValueFrom(
      this.http.get<ApiEnvelope<PaymentInfo> | PaymentInfo>(`${this.base}/payments/info/${loanId}`)
    );
    return this.unwrap(res);
  }

  // ── Registro de pago (offline-first) ───────────────────────
  /**
   * Guarda el pago en la cola local y trata de sincronizarlo.
   * Si no hay red, queda pendiente y se sincroniza después.
   */
  async registerPayment(p: Omit<LocalPayment, 'localId' | 'capturedAt' | 'synced'>): Promise<LocalPayment> {
    const payment: LocalPayment = {
      ...p,
      localId: this.uuid(),
      capturedAt: new Date().toISOString(),
      synced: false,
    };
    await this.storage.addPayment(payment);
    await this.refreshPendingCount();

    // Intentar sincronizar de inmediato si hay red
    if (await this.network.isOnline()) {
      await this.syncOne(payment);
    }
    return payment;
  }

  // ── Sincronización ─────────────────────────────────────────
  /** Sincroniza todos los pagos pendientes. */
  async syncPending(): Promise<{ ok: number; fail: number }> {
    if (!(await this.network.isOnline())) return { ok: 0, fail: 0 };
    this.syncing.set(true);
    let ok = 0, fail = 0;
    const pending = await this.storage.getPendingPayments();
    for (const p of pending) {
      const success = await this.syncOne(p);
      success ? ok++ : fail++;
    }
    // Sincronizar también visitas pendientes
    const pendingVisits = await this.storage.getPendingVisits();
    for (const v of pendingVisits) {
      const success = await this.syncOneVisit(v);
      success ? ok++ : fail++;
    }
    this.syncing.set(false);
    await this.refreshPendingCount();
    return { ok, fail };
  }

  /** Envía un pago al backend. Marca synced=true si tiene éxito. */
  private async syncOne(p: LocalPayment): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.post<ApiEnvelope<any> | any>(`${this.base}/payments`, {
          loanId: p.loanId,
          amountPaid: p.amountPaid,
          paymentType: p.paymentType,
          method: p.method,
          applyExcedenteToMora: p.applyExcedenteToMora,
          notes: p.notes,
          localId: p.localId,        // idempotencia: el backend puede deduplicar
          lat: p.lat,
          lng: p.lng,
          source: 'COBRADOR',
        })
      );
      const data = this.unwrap(res);
      const serverId = data?.payment?.id;
      const receiptNumber = data?.payment?.receiptNumber;
      await this.storage.updatePayment(p.localId, {
        synced: true,
        syncedAt: new Date().toISOString(),
        serverId,
        receiptNumber,
        error: undefined,
      });
      return true;
    } catch (e: any) {
      await this.storage.updatePayment(p.localId, {
        error: e?.error?.message || 'Error de sincronización',
      });
      return false;
    }
  }

  async refreshPendingCount() {
    const pending = await this.storage.getPendingPayments();
    const pendingVisits = await this.storage.getPendingVisits();
    this.pendingCount.set(pending.length + pendingVisits.length);
  }

  // ── Visitas (offline-first) ────────────────────────────────
  async registerVisit(v: Omit<LocalVisit, 'localId' | 'capturedAt' | 'synced'>): Promise<LocalVisit> {
    const visit: LocalVisit = {
      ...v,
      localId: this.uuid(),
      capturedAt: new Date().toISOString(),
      synced: false,
    };
    await this.storage.addVisit(visit);
    await this.refreshPendingCount();
    if (await this.network.isOnline()) {
      await this.syncOneVisit(visit);
    }
    return visit;
  }

  private async syncOneVisit(v: LocalVisit): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.post<ApiEnvelope<any> | any>(`${this.base}/visitas`, {
          loanId: v.loanId,
          tipo: v.tipo,
          notas: v.notas,
          fechaPromesa: v.fechaPromesa,
          montoPromesa: v.montoPromesa,
          lat: v.lat,
          lng: v.lng,
          localId: v.localId,
        })
      );
      const data = this.unwrap(res);
      const serverId = data?.visita?.id;
      await this.storage.updateVisit(v.localId, {
        synced: true,
        syncedAt: new Date().toISOString(),
        serverId,
        error: undefined,
      });
      return true;
    } catch (e: any) {
      await this.storage.updateVisit(v.localId, {
        error: e?.error?.message || 'Error de sincronización',
      });
      return false;
    }
  }

  // ── Utilidades ─────────────────────────────────────────────
  private unwrap<T>(res: ApiEnvelope<T> | T): T {
    return res && (res as any).data !== undefined ? (res as ApiEnvelope<T>).data : (res as T);
  }

  private uuid(): string {
    // RFC4122 v4 simplificado
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
