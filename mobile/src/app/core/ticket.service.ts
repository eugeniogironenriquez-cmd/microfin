import { Injectable } from '@angular/core';
import { LocalPayment, AssignedClient } from './models';

/**
 * Genera el texto del ticket de pago para entregar al cliente.
 * Se muestra en pantalla y puede compartirse / imprimirse.
 * Cuando el pago se sincroniza, el backend genera el recibo PDF oficial;
 * este ticket es el comprobante inmediato en campo.
 */
@Injectable({ providedIn: 'root' })
export class TicketService {
  build(payment: LocalPayment, client: AssignedClient | null, empresa = 'Microcapital - Ixtepec'): string {
    const fecha = new Date(payment.capturedAt);
    const f = fecha.toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const tipo = { DIA: 'Pago del día', TOTAL: 'Pago total', MORATORIO: 'Pago moratorio' }[payment.paymentType];
    const folio = payment.receiptNumber || ('LOCAL-' + payment.localId.substring(0, 8).toUpperCase());

    const lines = [
      '================================',
      `   ${empresa}`,
      '   COMPROBANTE DE PAGO',
      '================================',
      `Folio: ${folio}`,
      `Fecha: ${f}`,
      '--------------------------------',
      `Cliente: ${client?.customerName || '-'}`,
      `Concepto: ${tipo}`,
      `Método: ${payment.method}`,
      '--------------------------------',
      `MONTO PAGADO: $${payment.amountPaid.toFixed(2)}`,
      '--------------------------------',
      payment.synced
        ? 'Estado: SINCRONIZADO'
        : 'Estado: PENDIENTE DE SINCRONIZAR',
      '',
      'Gracias por su pago.',
      '================================',
    ];
    return lines.join('\n');
  }
}
