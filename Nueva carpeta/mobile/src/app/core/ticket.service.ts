import { Injectable } from '@angular/core';
import { LocalPayment, AssignedClient, Empresa } from './models';

/**
 * Genera el texto del ticket de pago para mostrar en pantalla y compartir.
 * Usa el snapshot del pago (capturado al registrar) para incluir monto,
 * cuota, saldo, progreso (28/30) y las cuotas pagadas — igual que el ticket
 * de la impresora térmica. Funciona offline (todo viene del snapshot).
 *
 * Cuando el pago se sincroniza, el backend genera el recibo PDF oficial;
 * este ticket es el comprobante inmediato en campo.
 */
@Injectable({ providedIn: 'root' })
export class TicketService {
  build(
    payment: LocalPayment,
    client: AssignedClient | null,
    empresa?: Empresa | string | null,
  ): string {
    const money = (v: any) =>
      '$' + (Number(v) || 0).toLocaleString('es-MX', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      });

    // Empresa: acepta objeto Empresa, string (compat) o nada.
    const nombreEmpresa =
      typeof empresa === 'string' ? empresa
      : empresa?.nombre || 'Microcapital - Ixtepec';
    const pieLegal = typeof empresa === 'object' && empresa ? empresa.pieLegal : undefined;

    // Fechas: "Fecha y hora" (hora de México) y "Fecha de aplicación" (solo día).
    const fechaHora = this.fechaHora(payment.capturedAt);
    const fechaAplic = this.fechaSolo(payment.capturedAt);

    const folio = (payment.receiptNumber || payment.serverId
      || ('LOCAL-' + payment.localId.substring(0, 8))).toUpperCase();

    const snap = payment.snapshot;

    const L: string[] = [];
    L.push('================================');
    L.push(`   ${nombreEmpresa}`);
    L.push('   COMPROBANTE DE PAGO');
    L.push('================================');

    // Datos del crédito / cliente
    L.push(`Folio: ${folio}`);
    L.push(`Cliente: ${client?.customerName || '-'}`);
    if (snap) {
      L.push(`Monto: ${money(snap.principalAmount)}`);
      L.push(`Cuota: ${money(snap.periodicPayment)}`);
      L.push(`Saldo: ${money(snap.saldoPendiente)}`);
    }
    L.push('--------------------------------');

    // Progreso
    if (snap && snap.totalCuotas > 0) {
      L.push(`Pago realizado: ${snap.cuotaActual}/${snap.totalCuotas}`);
      L.push(`Pagos pendientes: ${snap.cuotasPendientes}`);
    }

    // Cuotas pagadas con fecha
    if (snap && snap.cuotasPagadas.length > 0) {
      L.push('Cuotas pagadas:');
      for (const c of snap.cuotasPagadas.slice().sort((a, b) => a.periodo - b.periodo)) {
        const f = c.fecha ? this.fechaSolo(c.fecha) : '';
        const etiqueta = `  #${c.periodo}`;
        const pad = Math.max(1, 22 - etiqueta.length - f.length);
        L.push(`${etiqueta}${' '.repeat(pad)}${f}`);
      }
    }
    if (snap && snap.mora > 0) {
      L.push(`Moratorio: ${money(snap.mora)}`);
    }
    if (snap) L.push('--------------------------------');

    // Estado de sincronización
    if (!payment.synced) {
      L.push('** Pendiente de sincronizar **');
      L.push('--------------------------------');
    }

    // Total
    L.push(`TOTAL RECIBIDO: ${money(payment.amountPaid)}`);
    L.push('--------------------------------');

    // Fechas
    L.push(`Fecha y hora: ${fechaHora}`);
    L.push(`Fecha de aplicacion: ${fechaAplic}`);
    if (payment.method) L.push(`Metodo: ${payment.method}`);
    L.push('================================');

    // Pie legal de la empresa (si viene)
    if (pieLegal) {
      for (const linea of pieLegal.split('\n').map((l) => l.trim()).filter(Boolean)) {
        L.push(linea);
      }
      L.push('');
    }
    L.push('Gracias por su pago');

    return L.join('\n');
  }

  // Fecha + hora en zona de México (para "Fecha y hora").
  private fechaHora(iso: string): string {
    try {
      const dt = new Date(iso);
      return new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(dt).replace(',', '');
    } catch { return iso; }
  }

  // Solo fecha (para vencimientos y "Fecha de aplicación"), en UTC para no
  // correr el día de las fechas tipo 'date'.
  private fechaSolo(iso: string): string {
    try {
      const dt = new Date(iso);
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${dt.getUTCFullYear()}`;
    } catch { return iso; }
  }
}