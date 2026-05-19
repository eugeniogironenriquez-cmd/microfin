// ============================================================
// OFFLINE DB SERVICE - Cola de operaciones pendientes
// Usa Capacitor Preferences (clave-valor persistente)
// Para producción avanzada, migrar a @capacitor-community/sqlite
// ============================================================
import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { v4 as uuidv4 } from 'uuid';

export interface OfflinePayment {
  localId: string;
  loanId: string;
  amountPaid: number;
  method: string;
  reference?: string;
  notes?: string;
  paymentDate: string;
  geolocation?: { lat: number; lng: number };
  synced: boolean;
  createdAt: string;
}

export interface OfflineVisit {
  localId: string;
  loanId: string;
  type: string;
  promisedAmount?: number;
  promisedDate?: string;
  notes?: string;
  geolocation?: { lat: number; lng: number };
  visitedAt: string;
  synced: boolean;
}

const PAYMENTS_KEY = 'offline_payments';
const VISITS_KEY = 'offline_visits';

@Injectable({ providedIn: 'root' })
export class OfflineDbService {
  // ── PAGOS ─────────────────────────────────────────────────
  async savePayment(data: Omit<OfflinePayment, 'localId' | 'synced' | 'createdAt'>): Promise<OfflinePayment> {
    const payment: OfflinePayment = {
      ...data,
      localId: uuidv4(),
      synced: false,
      createdAt: new Date().toISOString(),
    };
    const list = await this.getPayments();
    list.push(payment);
    await Preferences.set({ key: PAYMENTS_KEY, value: JSON.stringify(list) });
    return payment;
  }

  async getPayments(): Promise<OfflinePayment[]> {
    const result = await Preferences.get({ key: PAYMENTS_KEY });
    return result.value ? JSON.parse(result.value) : [];
  }

  async getPendingPayments(): Promise<OfflinePayment[]> {
    return (await this.getPayments()).filter((p) => !p.synced);
  }

  async markPaymentSynced(localId: string): Promise<void> {
    const list = await this.getPayments();
    const idx = list.findIndex((p) => p.localId === localId);
    if (idx >= 0) {
      list[idx].synced = true;
      await Preferences.set({ key: PAYMENTS_KEY, value: JSON.stringify(list) });
    }
  }

  // ── VISITAS ───────────────────────────────────────────────
  async saveVisit(data: Omit<OfflineVisit, 'localId' | 'synced'>): Promise<OfflineVisit> {
    const visit: OfflineVisit = {
      ...data,
      localId: uuidv4(),
      synced: false,
    };
    const list = await this.getVisits();
    list.push(visit);
    await Preferences.set({ key: VISITS_KEY, value: JSON.stringify(list) });
    return visit;
  }

  async getVisits(): Promise<OfflineVisit[]> {
    const result = await Preferences.get({ key: VISITS_KEY });
    return result.value ? JSON.parse(result.value) : [];
  }

  async getPendingVisits(): Promise<OfflineVisit[]> {
    return (await this.getVisits()).filter((v) => !v.synced);
  }

  async markVisitSynced(localId: string): Promise<void> {
    const list = await this.getVisits();
    const idx = list.findIndex((v) => v.localId === localId);
    if (idx >= 0) {
      list[idx].synced = true;
      await Preferences.set({ key: VISITS_KEY, value: JSON.stringify(list) });
    }
  }

  async getPendingCount(): Promise<number> {
    const [payments, visits] = await Promise.all([
      this.getPendingPayments(),
      this.getPendingVisits(),
    ]);
    return payments.length + visits.length;
  }

  async clearSynced(): Promise<void> {
    const [payments, visits] = await Promise.all([this.getPayments(), this.getVisits()]);
    await Promise.all([
      Preferences.set({ key: PAYMENTS_KEY, value: JSON.stringify(payments.filter((p) => !p.synced)) }),
      Preferences.set({ key: VISITS_KEY, value: JSON.stringify(visits.filter((v) => !v.synced)) }),
    ]);
  }
}
