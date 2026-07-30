import { Injectable } from "@angular/core";
import { Preferences } from "@capacitor/preferences";
import {
  AuthUser,
  AssignedClient,
  LocalPayment,
  LocalVisit,
  LocalGestorAccion,
  Empresa,
} from "./models";

// Claves de almacenamiento local
const K_TOKEN = "access_token";
const K_REFRESH = "refresh_token";
const K_USER = "user";
const K_CLIENTS = "assigned_clients";
const K_PAYMENTS = "local_payments";
const K_VISITS = "local_visits";
const K_GESTOR = "local_gestor_acciones";
const K_SCHEDULES = "loan_schedules";   // calendario completo por crédito (offline)

/**
 * Servicio de almacenamiento local (offline-first).
 * Usa Capacitor Preferences, que persiste en el dispositivo
 * incluso sin conexión y entre reinicios de la app.
 */
@Injectable({ providedIn: "root" })
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
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
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
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // ── Calendario de cuotas por crédito (cache offline) ───────
  // Guarda TODAS las cuotas (pagadas, pendientes, parciales) de los créditos
  // asignados, para poder consultarlas sin conexión.
  async setSchedules(schedules: any[]) {
    await Preferences.set({ key: K_SCHEDULES, value: JSON.stringify(schedules) });
  }

  async getSchedules(): Promise<any[]> {
    const raw = (await Preferences.get({ key: K_SCHEDULES })).value;
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // Cuotas de un crédito específico desde el cache local.
  async getSchedulesByLoan(loanId: string): Promise<any[]> {
    const all = await this.getSchedules();
    const found = all.find((x: any) => x.loanId === loanId);
    return found?.cuotas || [];
  }

  // ── Pagos locales (cola de sincronización) ─────────────────
  async getPayments(): Promise<LocalPayment[]> {
    const raw = (await Preferences.get({ key: K_PAYMENTS })).value;
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
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
    const idx = all.findIndex((p) => p.localId === localId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      await this.savePayments(all);
    }
  }

  async getPendingPayments(): Promise<LocalPayment[]> {
    return (await this.getPayments()).filter((p) => !p.synced);
  }

  // ── Visitas locales (cola de sincronización) ───────────────
  async getVisits(): Promise<LocalVisit[]> {
    const raw = (await Preferences.get({ key: K_VISITS })).value;
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
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
    const idx = all.findIndex((v) => v.localId === localId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      await this.saveVisits(all);
    }
  }

  async getPendingVisits(): Promise<LocalVisit[]> {
    return (await this.getVisits()).filter((v) => !v.synced);
  }

  // ── Acciones de gestor (cola de sincronización) ────────────
  async getGestorAcciones(): Promise<LocalGestorAccion[]> {
    const raw = (await Preferences.get({ key: K_GESTOR })).value;
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async saveGestorAcciones(items: LocalGestorAccion[]) {
    await Preferences.set({ key: K_GESTOR, value: JSON.stringify(items) });
  }

  async addGestorAccion(item: LocalGestorAccion) {
    const all = await this.getGestorAcciones();
    all.unshift(item);
    await this.saveGestorAcciones(all);
  }

  async updateGestorAccion(localId: string, patch: Partial<LocalGestorAccion>) {
    const all = await this.getGestorAcciones();
    const idx = all.findIndex((x) => x.localId === localId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      await this.saveGestorAcciones(all);
    }
  }

  async getPendingGestorAcciones(): Promise<LocalGestorAccion[]> {
    return (await this.getGestorAcciones()).filter((x) => !x.synced);
  }

  private readonly EMPRESA_KEY = "empresa_config";

  async setEmpresa(empresa: Empresa): Promise<void> {
    await Preferences.set({
      key: this.EMPRESA_KEY,
      value: JSON.stringify(empresa),
    });
  }

  async getEmpresa(): Promise<Empresa | null> {
    try {
      const { value } = await Preferences.get({ key: this.EMPRESA_KEY });
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }
}