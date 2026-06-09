import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { AuthUser, AssignedClient, LocalPayment, LocalVisit } from './models';

// Claves de almacenamiento local
const K_TOKEN    = 'access_token';
const K_REFRESH  = 'refresh_token';
const K_USER     = 'user';
const K_CLIENTS  = 'assigned_clients';
const K_PAYMENTS = 'local_payments';
const K_VISITS   = 'local_visits';

/**
 * Servicio de almacenamiento local (offline-first).
 * Usa Capacitor Preferences, que persiste en el dispositivo
 * incluso sin conexión y entre reinicios de la app.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {

  // ── Sesión ─────────────────────────────────────────────────
  async setSession(token: string, refresh: string, user: AuthUser) {
    await Preferences.set({ key: K_TOKEN, value: token });
    await Preferences.set({ key: K_REFRESH, value: refresh });
    await Preferences.set({ key: K_USER, value: JSON.stringify(user) });
  }

  async getToken(): Promise<string | null> {
    return (await Preferences.get({ key: K_TOKEN })).value;
  }

  async getRefreshToken(): Promise<string | null> {
    return (await Preferences.get({ key: K_REFRESH })).value;
  }

  async setToken(token: string) {
    await Preferences.set({ key: K_TOKEN, value: token });
  }

  async getUser(): Promise<AuthUser | null> {
    const raw = (await Preferences.get({ key: K_USER })).value;
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  async clearSession() {
    await Preferences.remove({ key: K_TOKEN });
    await Preferences.remove({ key: K_REFRESH });
    await Preferences.remove({ key: K_USER });
  }

  // ── Clientes asignados (cache offline) ─────────────────────
  async setClients(clients: AssignedClient[]) {
    await Preferences.set({ key: K_CLIENTS, value: JSON.stringify(clients) });
  }

  async getClients(): Promise<AssignedClient[]> {
    const raw = (await Preferences.get({ key: K_CLIENTS })).value;
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
  }

  // ── Pagos locales (cola de sincronización) ─────────────────
  async getPayments(): Promise<LocalPayment[]> {
    const raw = (await Preferences.get({ key: K_PAYMENTS })).value;
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
  }

  async savePayments(payments: LocalPayment[]) {
    await Preferences.set({ key: K_PAYMENTS, value: JSON.stringify(payments) });
  }

  async addPayment(payment: LocalPayment) {
    const all = await this.getPayments();
    all.unshift(payment);
    await this.savePayments(all);
  }

  async updatePayment(localId: string, patch: Partial<LocalPayment>) {
    const all = await this.getPayments();
    const idx = all.findIndex(p => p.localId === localId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      await this.savePayments(all);
    }
  }

  async getPendingPayments(): Promise<LocalPayment[]> {
    return (await this.getPayments()).filter(p => !p.synced);
  }

  // ── Visitas locales (cola de sincronización) ───────────────
  async getVisits(): Promise<LocalVisit[]> {
    const raw = (await Preferences.get({ key: K_VISITS })).value;
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
  }

  async saveVisits(visits: LocalVisit[]) {
    await Preferences.set({ key: K_VISITS, value: JSON.stringify(visits) });
  }

  async addVisit(visit: LocalVisit) {
    const all = await this.getVisits();
    all.unshift(visit);
    await this.saveVisits(all);
  }

  async updateVisit(localId: string, patch: Partial<LocalVisit>) {
    const all = await this.getVisits();
    const idx = all.findIndex(v => v.localId === localId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      await this.saveVisits(all);
    }
  }

  async getPendingVisits(): Promise<LocalVisit[]> {
    return (await this.getVisits()).filter(v => !v.synced);
  }
}
