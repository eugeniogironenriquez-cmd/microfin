import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import {
  MonitorResponse, CreditoSemaforo, NivelSemaforo, ConfigSemaforo,
  HistorialResponse, SimulacionResponse,
} from './models';

@Injectable({ providedIn: 'root' })
export class GestorService {
  private api = inject(ApiService);

  // ── DETALLE DEL CRÉDITO + AVAL ────────────────────────────
  /** Crédito completo con su cliente (dirección, teléfono, CURP). */
  getLoan(loanId: string): Observable<any> {
    return this.api.get<any>(`/loans/${loanId}`);
  }

  /** Aval del crédito (o null si no tiene). */
  getAval(loanId: string): Observable<any> {
    return this.api.get<any>(`/loans/${loanId}/guarantor`);
  }

  // ── SEGUIMIENTO (visitas) ─────────────────────────────────
  /** Historial de seguimientos/visitas de un crédito. */
  getSeguimientos(loanId: string): Observable<any[]> {
    return this.api.get<any[]>(`/visitas/prestamo/${loanId}`).pipe(
      map((r) => (Array.isArray(r) ? r : [])),
    );
  }

  /** Registra un seguimiento (llamada, mensaje, visita, otro). */
  registrarSeguimiento(loanId: string, tipo: string, notas?: string): Observable<any> {
    return this.api.post<any>('/visitas', { loanId, tipo, notas });
  }

  // ── SEMÁFORO / MONITOR ────────────────────────────────────
  /** Monitor completo de cartera (los 3 niveles). Filtrable. */
  getMonitor(filtros?: { nivel?: NivelSemaforo; search?: string }): Observable<MonitorResponse> {
    return this.api.get<any>('/semaforo/monitor', filtros).pipe(
      map((raw) => this.normalizarMonitor(raw)),
    );
  }

  /** Vista del gestor: solo los rojos. */
  getGestor(search?: string): Observable<MonitorResponse> {
    return this.api.get<any>('/semaforo/gestor', { search }).pipe(
      map((raw) => this.normalizarMonitor(raw)),
    );
  }

  /** Historial de comportamiento de un cliente. */
  getHistorial(customerId: string): Observable<HistorialResponse> {
    return this.api.get<HistorialResponse>(`/semaforo/historial/${customerId}`);
  }

  getConfig(): Observable<ConfigSemaforo> {
    return this.api.get<ConfigSemaforo>('/semaforo/config');
  }

  updateConfig(dto: ConfigSemaforo): Observable<ConfigSemaforo> {
    return this.api.put<ConfigSemaforo>('/semaforo/config', dto);
  }

  // ── ACCIONES DE GESTOR ────────────────────────────────────
  /** Simula una reestructura (nueva cuota/total/calendario). */
  simular(principalAmount: number, days: number, customPayment?: number): Observable<SimulacionResponse> {
    // El monto de reestructura ya incluye el interés del crédito original,
    // así que se simula sin aplicar el factor (esReestructura: true).
    return this.api.post<SimulacionResponse>('/loans/simulate', {
      principalAmount, days, customPayment, esReestructura: true,
    });
  }

  /** Aplica reestructura a un crédito. Campos por confirmar con backend. */
  reestructurar(loanId: string, payload: Record<string, any>): Observable<any> {
    return this.api.post<any>(`/loans/${loanId}/restructure`, payload);
  }

  /** Aplica convenio a un crédito. Campos por confirmar con backend. */
  convenio(loanId: string, payload: Record<string, any>): Observable<any> {
    return this.api.post<any>(`/loans/${loanId}/convenio`, payload);
  }

  /** Registra una promesa de pago (va como visita tipo PROMESA_PAGO). */
  promesaPago(loanId: string, fechaPromesa: string, montoPromesa: number, notas?: string): Observable<any> {
    return this.api.post<any>('/visitas', {
      loanId,
      tipo: 'PROMESA_PAGO',
      fechaPromesa,
      montoPromesa,
      notas,
    });
  }

  // ── NORMALIZACIÓN ─────────────────────────────────────────
  /**
   * El backend puede devolver el monitor de varias formas (array plano, o
   * { resumen, creditos }). Esta función lo deja siempre como MonitorResponse
   * y calcula el resumen si no viene. Ajustar los nombres de campo aquí si el
   * backend usa otros (ej. cuotasVencidas vs overdueCount).
   */
  private normalizarMonitor(raw: any): MonitorResponse {
    const lista: any[] = Array.isArray(raw)
      ? raw
      : (raw?.creditos || raw?.data || []);

    const creditos: CreditoSemaforo[] = lista.map((c) => ({
      loanId:          c.loanId || c.id,
      customerId:      c.customerId || c.customer?.id,
      customerName:    c.customerName || c.customer?.fullName || 'Cliente',
      phone:           c.phone || c.customer?.phone,
      nivel:           (c.nivel || c.level || 'VERDE') as NivelSemaforo,
      cuotasVencidas:  Number(c.cuotasVencidas ?? c.overdueCount ?? 0),
      saldoPendiente:  c.saldoPendiente != null ? Number(c.saldoPendiente) : undefined,
      moraPendiente:   c.moraPendiente != null ? Number(c.moraPendiente) : undefined,
      periodicPayment: c.periodicPayment != null ? Number(c.periodicPayment) : undefined,
      principalAmount: c.principalAmount != null ? Number(c.principalAmount) : undefined,
      status:          c.status,
    }));

    // Resumen: usa el del backend si viene, si no lo calcula.
    const resumen = raw?.resumen || {
      verde:    creditos.filter((c) => c.nivel === 'VERDE').length,
      amarillo: creditos.filter((c) => c.nivel === 'AMARILLO').length,
      rojo:     creditos.filter((c) => c.nivel === 'ROJO').length,
      total:    creditos.length,
    };

    return { resumen, creditos };
  }
}