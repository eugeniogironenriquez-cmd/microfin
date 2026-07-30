import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

function cur(v: any) {
  return '$' + (Number(v) || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fdate(d: any) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dt);
}

function fdatetime(d: any) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dt).replace(',', '');
}

@Injectable()
export class ThermalTicketService {
  private templatePath = path.join(
    process.cwd(),
    'src',
    'printing',
    'templates',
    'ticket-80mm.html',
  );

  generate(data: any): string {
    const { payment, loan, company, stats } = data;

    let cuotasPagadas: Array<{ periodo: number; fecha: string }> = [];

    try {
      if (payment.cuotasPagadas) {
        cuotasPagadas =
          typeof payment.cuotasPagadas === 'string'
            ? JSON.parse(payment.cuotasPagadas)
            : payment.cuotasPagadas;
      }
    } catch {
      cuotasPagadas = [];
    }

    const cuotasHtml =
      cuotasPagadas.length > 0
        ? cuotasPagadas
            .sort((a, b) => a.periodo - b.periodo)
            .map(
              c => `
              <div class="row">
                <span>#${c.periodo}</span>
                <span>${fdate(c.fecha)}</span>
              </div>`,
            )
            .join('')
        : `<div class="row"><span>—</span><span>—</span></div>`;

    const values: Record<string, string> = {
      empresa: company?.name || 'Microcapital - Ixtepec',
      telefono: company?.phone || '—',
      folio: (payment?.receiptNumber || payment?.id?.substring(0, 8) || '—').toUpperCase(),
      cliente: loan?.customer?.fullName || '—',
      monto: cur(loan?.principalAmount),
      cuota: cur(loan?.periodicPayment),
      saldo: cur(stats?.saldo),
      pagoRealizado: `${stats?.cuotasPagadas ?? 0}/${stats?.totalCuotas ?? loan?.termWeeks ?? 0}`,
      pagosPendientes: String(stats?.cuotasPendientes ?? 0),
      cuotasPagadasHtml: cuotasHtml,
      totalRecibido: cur(payment?.amountPaid),
      fechaHora: fdatetime(payment?.createdAt || payment?.paymentDate || new Date()),
      fechaAplicacion: fdate(payment?.paymentDate || payment?.createdAt || new Date()),
    };

    const templatePath = this.getTicketTemplatePath();
    let html = fs.readFileSync(this.templatePath, 'utf8');


    for (const [key, value] of Object.entries(values)) {
      html = html.replaceAll(`{{${key}}}`, value);
    }

    return html;
  }

  private getTicketTemplatePath(): string {
  const paths = [
    path.join(process.cwd(), 'dist', 'printing', 'templates', 'ticket-80mm.html'),
    path.join(process.cwd(), 'src', 'printing', 'templates', 'ticket-80mm.html'),
    path.join(process.cwd(), 'printing', 'templates', 'ticket-80mm.html'),
  ];

  const found = paths.find(p => fs.existsSync(p));
  if (!found) throw new Error(`No se encontró ticket-80mm.html`);

  return found;
}
}