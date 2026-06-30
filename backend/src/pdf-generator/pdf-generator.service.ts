import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import * as PDFDocument from 'pdfkit';

const GREEN  = '#1C4532';
const GREEN2 = '#0d2b1e';
const GRAY   = '#718096';
const LGRAY  = '#F7FAFC';
const BORDER = '#CBD5E0';
const WHITE  = '#FFFFFF';
const TEXT   = '#171923';
const ALT    = '#F0FFF4';
const RB     = 'Helvetica';
const BB     = 'Helvetica-Bold';

function freq2unit(f: string) {
  return { DIARIO:'días', SEMANAL:'semanas', QUINCENAL:'quincenas', MENSUAL:'meses' }[f] ?? 'períodos';
}
function cur(v: any) {
  return '$' + (Number(v)||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
}
// Formatear fechas en UTC para respetar el día-calendario que generó el backend
// (las fechas de vencimiento y desembolso se guardan a medianoche UTC).
function fdate(d: any) {
  if (!d) return '—';
  try {
    const dt = typeof d === 'string' ? new Date(d) : d;
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = dt.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch { return String(d); }
}

// ── Fecha+hora para el ticket térmico ──
// IMPORTANTE: en este sistema, payment.paymentDate YA se guarda en hora de
// México (el backend resta 6h al registrar el pago). Por eso aquí NO se vuelve
// a restar: se formatea el valor tal cual viene (leído como UTC = hora México).
function fdatetimeMX(d: any) {
  if (!d) return '—';
  try {
    const dt = typeof d === 'string' ? new Date(d) : d;
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = dt.getUTCFullYear();
    const hh = String(dt.getUTCHours()).padStart(2, '0');
    const mi = String(dt.getUTCMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch { return String(d); }
}
function fdateMX(d: any) {
  if (!d) return '—';
  try {
    const dt = typeof d === 'string' ? new Date(d) : d;
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = dt.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch { return String(d); }
}

// Page dimensions (LETTER)
const PW = 612, PH = 792;
const ML = 50, MR = 50, MT = 50;
const FOOTER_H = 36;
const USABLE_H = PH - MT - FOOTER_H - 10; // content area height per page

@Injectable()
export class PdfGeneratorService {

  // ── PLAN DE PAGOS ─────────────────────────────────────────
  async generateSimulationPdf(data: any, res: Response): Promise<void> {
    const doc = new PDFDocument({ size:'LETTER', margin: MT, bufferPages: true });
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="plan-pagos-${Date.now()}.pdf"`);
    doc.pipe(res);
    this.buildSimPdf(doc, data);
    (doc as any).flushPages?.();
    this.addFootersToAllPages(doc, data.companyName||'Microcapital-Ixtepec', data.legalFooter, data.generatedAt||new Date());
    doc.end();
  }

  // ── CONTRATO ──────────────────────────────────────────────
  async generateLoanPdf(data: any, res: Response): Promise<void> {
    const doc = new PDFDocument({ size:'LETTER', margin: MT, bufferPages: true });
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="contrato-${data.loan.id.substring(0,8)}.pdf"`);
    doc.pipe(res);
    this.buildLoanPdf(doc, data);
    // Flush buffer to get accurate page count, then add footers
    (doc as any).flushPages?.();
    this.addFootersToAllPages(doc, data.companyName||'Microcapital-Ixtepec', data.legalFooter, new Date());
    doc.end();
  }

  // ── COMPROBANTE ───────────────────────────────────────────
  async generatePaymentReceipt(data: any, res: Response): Promise<void> {
    const { payment, loan, company } = data;

    // ── Parsear cuotas pagadas ANTES de crear el documento, para calcular
    //    la altura que necesita el bloque y el alto total de la página. ──
    let cuotasPagadas: Array<{ periodo: number; fecha: string }> = [];
    try {
      if (payment.cuotasPagadas) {
        cuotasPagadas = typeof payment.cuotasPagadas === 'string'
          ? JSON.parse(payment.cuotasPagadas)
          : payment.cuotasPagadas;
      }
    } catch { cuotasPagadas = []; }

    const tieneMora = Number(payment.lateInterestApplied || 0) > 0;
    const fechasTexto = cuotasPagadas.length > 0
      ? cuotasPagadas.map((c) => fdate(c.fecha)).join(', ')
      : '—';

    // Medir cuánto alto ocupa el texto de fechas con su ancho real.
    // Usamos un documento temporal solo para medir (no se envía).
    const fechasWidth = (PW - 80) * 0.6;
    const measureDoc = new PDFDocument({ size: [PW, 100], margin: 40 });
    measureDoc.font(BB).fontSize(8.5);
    const fechasH = Math.max(14, measureDoc.heightOfString(fechasTexto, { width: fechasWidth }));
    // El bloque de detalle: 34 (título + etiqueta) + alto de fechas + 12 de padding
    const detH = Math.max(56, 34 + fechasH + 12);

    // Alto total de la página: header(70) + bloques(72+8) + detalle + total(36) + pie(20)
    const pageH = 70 + 80 + detH + 8 + 36 + 30;

    const doc = new PDFDocument({ size:[PW, pageH], margin: 40, bufferPages: true });
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="comprobante-${payment.id.substring(0,8)}.pdf"`);
    doc.pipe(res);

    const cName = company?.name||'Microcapital-Ixtepec';
    const customer = loan?.customer;

    // Header
    doc.rect(0,0,PW,60).fill(GREEN);
    doc.font(BB).fontSize(15).fillColor(WHITE).text(cName, 40, 16, {lineBreak:false});
    doc.font(RB).fontSize(7).fillColor('rgba(255,255,255,0.7)')
       .text(`RFC: ${company?.rfc||'—'}  Tel: ${company?.phone||'—'}`, 40, 36, {lineBreak:false});
    doc.font(BB).fontSize(12).fillColor(WHITE)
       .text('COMPROBANTE DE PAGO', 300, 18, {width:272,align:'right',lineBreak:false});
    doc.font(RB).fontSize(7.5).fillColor('rgba(255,255,255,0.75)')
       .text(`Folio: ${(payment.receiptNumber||payment.id?.substring(0,8)||'—').toUpperCase()}`, 300, 34, {width:272,align:'right',lineBreak:false})
       .text(`Fecha: ${fdate(payment.paymentDate||new Date())}`, 300, 46, {width:272,align:'right',lineBreak:false});

    // Bloques
    const y1 = 70, half = (PW-80)/2;
    doc.rect(40,y1,half-4,72).fillAndStroke(LGRAY,BORDER);
    doc.font(BB).fontSize(7.5).fillColor(GREEN2).text('CLIENTE', 50, y1+8, {lineBreak:false});
    doc.font(RB).fontSize(8.5).fillColor(TEXT).text(customer?.fullName||'—', 50, y1+22, {lineBreak:false});
    doc.font(RB).fontSize(7).fillColor(GRAY)
       .text(`CURP: ${customer?.curp||'—'}`, 50, y1+36, {lineBreak:false})
       .text(`Tel: ${customer?.phone||'—'}`, 50, y1+48, {lineBreak:false});

    const x2 = 40+half+4;
    doc.rect(x2,y1,half-4,72).fillAndStroke(LGRAY,BORDER);
    doc.font(BB).fontSize(7.5).fillColor(GREEN2).text('CRÉDITO', x2+10, y1+8, {lineBreak:false});
    doc.font(RB).fontSize(7.5).fillColor(TEXT)
       .text(`ID: ${loan?.id?.substring(0,8).toUpperCase()||'—'}`, x2+10, y1+22, {lineBreak:false})
       .text(`Tipo: ${loan?.loanType?.name||'—'}`, x2+10, y1+34, {lineBreak:false})
       .text(`Cuota: ${cur(loan?.periodicPayment)}`, x2+10, y1+46, {lineBreak:false});

    // ── DETALLE DEL PAGO: bloque de alto dinámico (lista TODAS las fechas) ──
    const y2 = y1+80;
    doc.rect(40,y2,PW-80,detH).fillAndStroke('#F0FFF4','#BBF7D0');
    doc.font(BB).fontSize(8.5).fillColor('#16A34A').text('DETALLE DEL PAGO', 50, y2+8, {lineBreak:false});

    // Columna izquierda: cuotas pagadas (todas las fechas, con wrap completo)
    doc.font(RB).fontSize(7).fillColor(GRAY).text('Cuotas pagadas', 50, y2+24, {lineBreak:false});
    doc.font(BB).fontSize(8.5).fillColor(TEXT)
       .text(fechasTexto, 50, y2+34, {width:fechasWidth, lineBreak:true});

    // Columna derecha: Forma de pago, y Moratorio solo si aplica
    const colDerX = 50 + (PW-80)*0.62;
    doc.font(RB).fontSize(7).fillColor(GRAY).text('Forma', colDerX, y2+24, {lineBreak:false});
    doc.font(BB).fontSize(8.5).fillColor(TEXT).text(payment.method||'EFECTIVO', colDerX, y2+34, {lineBreak:false});

    if (tieneMora) {
      const colMoraX = colDerX + 90;
      doc.font(RB).fontSize(7).fillColor(GRAY).text('Moratorio', colMoraX, y2+24, {lineBreak:false});
      doc.font(BB).fontSize(8.5).fillColor('#DC2626').text(cur(payment.lateInterestApplied), colMoraX, y2+34, {lineBreak:false});
    }

    // El total y el pie se posicionan DESPUÉS del bloque dinámico
    const y3 = y2 + detH + 8;
    doc.rect(40,y3,PW-80,36).fill(GREEN);
    doc.font(RB).fontSize(10).fillColor(WHITE).text('TOTAL RECIBIDO:', 50, y3+11, {lineBreak:false});
    doc.font(BB).fontSize(15).fillColor(WHITE)
       .text(cur(payment.amountPaid), 200, y3+9, {width:PW-250,align:'right',lineBreak:false});

    doc.font(RB).fontSize(7).fillColor(GRAY)
       .text(company?.legalFooter||'Este comprobante es un documento válido de pago.',
         40, y3+46, {width:PW-80,align:'center',lineBreak:false});

    doc.end();
  }

  // ════════════════════════════════════════════════════════════
  // ── TICKET TÉRMICO 80mm ─────────────────────────────────────
  // Ancho 226pt ≈ 80mm. Alto dinámico según contenido.
  // Datos esperados en `data`:
  //   payment: { id, receiptNumber?, amountPaid, lateInterestApplied,
  //              method, paymentDate, cuotasPagadas (JSON [{periodo,fecha,mora?}]) }
  //   loan:    { id, principalAmount, periodicPayment, termWeeks, customer:{fullName} }
  //   company: { name, phone }
  //   stats:   { totalCuotas, cuotasPagadas, cuotasPendientes, saldo }
  // ════════════════════════════════════════════════════════════
  async generateThermalReceipt(data: any, res: Response): Promise<void> {
    const { payment, loan, company, stats } = data;

    // Ancho de papel térmico 80mm
    const TW = 226;             // ancho total en puntos (~80mm)
    const TM = 10;              // margen lateral
    const CW = TW - TM * 2;     // ancho de contenido
    const LX = TM;              // x izquierda
    const RX = TW - TM;         // x derecha

    // Parsear cuotas pagadas en esta transacción
    let cuotasPagadas: Array<{ periodo: number; fecha: string; mora?: number }> = [];
    try {
      if (payment.cuotasPagadas) {
        cuotasPagadas = typeof payment.cuotasPagadas === 'string'
          ? JSON.parse(payment.cuotasPagadas)
          : payment.cuotasPagadas;
      }
    } catch { cuotasPagadas = []; }

    // Cuotas con mora pagada en esta transacción (si el JSON trae mora por cuota)
    const cuotasConMora = cuotasPagadas.filter((c) => Number(c.mora || 0) > 0);
    const tieneMora = Number(payment.lateInterestApplied || 0) > 0;

    // Estadísticas del crédito (vienen calculadas del módulo de pagos)
    const totalCuotas      = Number(stats?.totalCuotas ?? loan?.termWeeks ?? 0);
    const cuotasPagadasNum = Number(stats?.cuotasPagadas ?? 0);
    const cuotasPendientes = Number(stats?.cuotasPendientes ?? 0);
    const saldo            = Number(stats?.saldo ?? 0);

    // Estimar el alto necesario (para el tamaño de página)
    let estH = 250;                              // base: encabezado + datos + total + pie
    estH += cuotasPagadas.length * 11 + 18;      // lista de cuotas pagadas
    if (tieneMora) estH += cuotasConMora.length * 11 + 28;
    const PAGE_H = Math.max(320, estH);

    const doc = new PDFDocument({ size: [TW, PAGE_H], margin: 0, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="ticket-${(payment.id||'').substring(0,8)}.pdf"`);
    doc.pipe(res);

    const cName  = (company?.name || 'Microcapital-Ixtepec');
    const cPhone = company?.phone || '—';
    const folio  = (payment.receiptNumber || payment.id?.substring(0,8) || '—').toUpperCase();
    const cliente = loan?.customer?.fullName || '—';

    let y = 12;

    // Helpers de dibujo --------------------------------------------------
    const center = (txt: string, size: number, font = RB, color = TEXT, gap = 2) => {
      doc.font(font).fontSize(size).fillColor(color)
         .text(txt, LX, y, { width: CW, align: 'center', lineBreak: true });
      y = doc.y + gap;
    };
    // Fila etiqueta (izq) + valor (der) en la misma línea
    const row = (label: string, value: string, size = 8, bold = false) => {
      doc.font(RB).fontSize(size).fillColor(GRAY).text(label, LX, y, { lineBreak: false });
      doc.font(bold ? BB : RB).fontSize(size).fillColor(TEXT)
         .text(value, LX, y, { width: CW, align: 'right', lineBreak: false });
      y += size + 4;
    };
    const sep = (dashed = true) => {
      y += 2;
      doc.save().lineWidth(0.5).strokeColor(BORDER);
      if (dashed) doc.dash(2, { space: 2 });
      doc.moveTo(LX, y).lineTo(RX, y).stroke();
      doc.undash().restore();
      y += 6;
    };

    // ── ENCABEZADO: empresa + teléfono ──────────────────────
    center(cName.toUpperCase(), 11, BB, GREEN2, 1);
    center(`Tel: ${cPhone}`, 8, RB, GRAY, 4);
    sep(false);
    center('COMPROBANTE DE PAGO', 9, BB, TEXT, 4);
    sep();

    // ── DATOS DEL CRÉDITO / CLIENTE ─────────────────────────
    row('Folio:',   folio, 8, true);
    row('Cliente:', cliente, 8);
    row('Monto:',   cur(loan?.principalAmount), 8);
    row('Cuota:',   cur(loan?.periodicPayment), 8);
    row('Saldo:',   cur(saldo), 8);
    sep();

    // ── RESUMEN DE PAGO ─────────────────────────────────────
    row('Pago realizado:', `${cuotasPagadasNum}/${totalCuotas}`, 8, true);
    row('Pagos pendientes:', String(cuotasPendientes), 8);

    // Lista de cuotas pagadas en esta transacción (con su día)
    if (cuotasPagadas.length > 0) {
      y += 2;
      doc.font(RB).fontSize(7.5).fillColor(GRAY).text('Cuotas pagadas:', LX, y, { lineBreak: false });
      y += 11;
      cuotasPagadas
        .sort((a, b) => a.periodo - b.periodo)
        .forEach((c) => {
          doc.font(RB).fontSize(7.5).fillColor(TEXT)
             .text(`  #${c.periodo}`, LX, y, { lineBreak: false });
          doc.font(RB).fontSize(7.5).fillColor(TEXT)
             .text(fdate(c.fecha), LX, y, { width: CW, align: 'right', lineBreak: false });
          y += 10;
        });
      y += 2;
    }

    // ── IMPORTE MORATORIO (con detalle de día si lo hay) ────
    if (tieneMora) {
      sep();
      row('Importe moratorio:', cur(payment.lateInterestApplied), 8, true);
      if (cuotasConMora.length > 0) {
        y += 1;
        doc.font(RB).fontSize(7).fillColor(GRAY).text('Mora de:', LX, y, { lineBreak: false });
        y += 10;
        cuotasConMora
          .sort((a, b) => a.periodo - b.periodo)
          .forEach((c) => {
            doc.font(RB).fontSize(7).fillColor(TEXT)
               .text(`  #${c.periodo}  ${fdate(c.fecha)}`, LX, y, { lineBreak: false });
            doc.font(RB).fontSize(7).fillColor('#DC2626')
               .text(cur(c.mora), LX, y, { width: CW, align: 'right', lineBreak: false });
            y += 10;
          });
      }
    }
    sep();

    // ── TOTAL RECIBIDO ──────────────────────────────────────
    doc.rect(LX, y, CW, 26).fill(GREEN);
    doc.font(RB).fontSize(8).fillColor(WHITE).text('TOTAL RECIBIDO', LX + 6, y + 5, { lineBreak: false });
    doc.font(BB).fontSize(12).fillColor(WHITE)
       .text(cur(payment.amountPaid), LX, y + 6, { width: CW - 6, align: 'right', lineBreak: false });
    y += 32;

    // ── FECHAS (hora de México) ─────────────────────────────
    row('Fecha y hora:', fdatetimeMX(payment.paymentDate || new Date()), 7.5);
    row('Fecha de aplicación:', fdateMX(payment.paymentDate || new Date()), 7.5);

    sep(false);
    center('¡Gracias por su pago!', 8, BB, GREEN2, 2);
    center('Conserve este comprobante', 6.5, RB, GRAY, 2);

    doc.end();
  }

  // ── BUILDERS ─────────────────────────────────────────────
  private buildSimPdf(doc: PDFKit.PDFDocument, data: any) {
    let y = this.drawHeader(doc, data.companyName||'Microcapital-Ixtepec',
      'PLAN DE PAGOS', 'Documento informativo, no constituye contrato');
    y = this.drawSummaryBox(doc, y, data);
    this.drawScheduleTable(doc, y, data.schedule);
  }

  private buildLoanPdf(doc: PDFKit.PDFDocument, data: any) {
    let y = this.drawHeader(doc, data.companyName||'Microcapital-Ixtepec',
      'CONTRATO DE CRÉDITO', `Folio: ${data.loan.id.substring(0,8).toUpperCase()}`);
    y = this.drawCustomerInfo(doc, y, data.customer);
    if (data.guarantor) y = this.drawGuarantorInfo(doc, y, data.guarantor);
    y = this.drawLoanInfo(doc, y, data.loan, data.loanType);
    y = this.drawScheduleTable(doc, y, data.schedules.map((s:any) => ({
      period: s.periodNumber, dueDate: s.dueDate,
      payment: Number(s.totalDue), principal: Number(s.principalDue),
      interest: Number(s.interestDue), balance: Number(s.balanceDue),
    })));
    this.drawSignatureSection(doc, y, data.customer.fullName, data.guarantor?.fullName, data.legalFooter);
  }

  // ── DRAW FUNCTIONS (return next Y) ───────────────────────
  private drawHeader(doc: PDFKit.PDFDocument, company: string, title: string, sub: string): number {
    doc.rect(0,0,PW,76).fill(GREEN);
    doc.font(BB).fontSize(15).fillColor(WHITE).text(company, ML, 20, {lineBreak:false});
    doc.font(RB).fontSize(7.5).fillColor('rgba(255,255,255,0.65)')
       .text('Sistema de Gestión Microfinanciera', ML, 42, {lineBreak:false});
    doc.font(BB).fontSize(12).fillColor(WHITE)
       .text(title, 0, 24, {width:PW-ML,align:'right',lineBreak:false});
    doc.font(RB).fontSize(7.5).fillColor('rgba(255,255,255,0.75)')
       .text(sub, 0, 42, {width:PW-ML,align:'right',lineBreak:false});
    return 90; // fixed Y after header
  }

  private drawSummaryBox(doc: PDFKit.PDFDocument, y: number, data: any): number {
    const H = 98;
    doc.rect(ML, y, PW-ML*2, H).fillAndStroke(LGRAY, BORDER);
    doc.font(BB).fontSize(8.5).fillColor(GREEN2).text('RESUMEN DEL CRÉDITO', ML+14, y+10, {lineBreak:false});

    const items = [
      ['Monto',  cur(data.principalAmount)],
      ['Plazo',  `${data.termWeeks} días`],
      ['Cuota diaria', cur(data.periodicPayment)],
      ['Frecuencia', 'DIARIO'],
    ];
    const cw = (PW-ML*2-28)/4;
    items.forEach((item, i) => {
      const cx = ML+14 + (i%4)*cw;
      const cy = y + 28 + Math.floor(i/4)*30;
      doc.font(RB).fontSize(7).fillColor(GRAY).text(item[0], cx, cy, {lineBreak:false});
      doc.font(BB).fontSize(9).fillColor(TEXT).text(item[1], cx, cy+11, {lineBreak:false});
    });
    if (data.customerName) {
      doc.font(RB).fontSize(7.5).fillColor(GRAY)
         .text(`Cliente: ${data.customerName}`, ML+14, y+H-14, {lineBreak:false});
    }
    return y + H + 8;
  }

  private drawSectionTitle(doc: PDFKit.PDFDocument, y: number, title: string): number {
    doc.rect(ML, y+2, 4, 13).fill(GREEN);
    doc.font(BB).fontSize(8.5).fillColor(GREEN2).text(title, ML+10, y+3, {lineBreak:false});
    doc.moveTo(ML, y+18).lineTo(PW-MR, y+18).strokeColor(BORDER).lineWidth(0.5).stroke();
    return y + 24;
  }

  private drawCustomerInfo(doc: PDFKit.PDFDocument, y: number, customer: any): number {
    y = this.drawSectionTitle(doc, y, 'DATOS DEL ACREDITADO');
    const H = 70;
    doc.rect(ML, y, PW-ML*2, H).fillAndStroke(LGRAY, BORDER);
    const fields = [
      ['Nombre', customer.fullName], ['CURP', customer.curp],
      ['RFC', customer.rfc||'—'], ['Teléfono', customer.phone],
      ['Email', customer.email||'—'],
      ['Domicilio', customer.address
        ? [customer.address.street,customer.address.colonia,customer.address.municipality].filter(Boolean).join(', ')
        : '—'],
    ];
    const cw = (PW-ML*2-28)/2;
    fields.forEach((f, i) => {
      const cx = ML+14 + (i%2)*cw;
      const cy = y + 8 + Math.floor(i/2)*20;
      doc.font(RB).fontSize(7).fillColor(GRAY).text(f[0], cx, cy, {lineBreak:false});
      doc.font(BB).fontSize(8).fillColor(TEXT).text(f[1], cx, cy+9, {width:cw-10,lineBreak:false});
    });
    return y + H + 6;
  }

  private drawGuarantorInfo(doc: PDFKit.PDFDocument, y: number, guarantor: any): number {
    y = this.drawSectionTitle(doc, y, 'DATOS DEL AVAL');
    const H = 56;
    doc.rect(ML, y, PW-ML*2, H).fillAndStroke('#FFFBEB', '#FDE68A');
    const fields = [
      ['Nombre', guarantor.fullName], ['CURP', guarantor.curp],
      ['Teléfono', guarantor.phone], ['Parentesco', guarantor.relationship||'—'],
      ['Domicilio', guarantor.address||'—'],
    ];
    const cw = (PW-ML*2-28)/3;
    fields.forEach((f, i) => {
      const cx = ML+14 + (i%3)*cw;
      const cy = y + 8 + Math.floor(i/3)*22;
      doc.font(RB).fontSize(7).fillColor(GRAY).text(f[0], cx, cy, {lineBreak:false});
      doc.font(BB).fontSize(8).fillColor(TEXT).text(f[1], cx, cy+9, {width:cw-8,lineBreak:false});
    });
    return y + H + 6;
  }

  private drawLoanInfo(doc: PDFKit.PDFDocument, y: number, loan: any, loanType: any): number {
    y = this.drawSectionTitle(doc, y, 'CONDICIONES DEL CRÉDITO');
    const H = 70;
    doc.rect(ML, y, PW-ML*2, H).fillAndStroke(LGRAY, BORDER);
    const fields = [
      ['Monto', cur(loan.principalAmount)],
      ['Plazo', `${loan.termWeeks} días`],
      ['Cuota diaria', cur(loan.periodicPayment)],
      ['Frecuencia', 'DIARIO'],
      ['Desembolso', fdate(loan.disbursedAt)],
    ];
    const cw = (PW-ML*2-28)/4;
    fields.forEach((f, i) => {
      const cx = ML+14 + (i%4)*cw;
      const cy = y + 8 + Math.floor(i/4)*26;
      doc.font(RB).fontSize(7).fillColor(GRAY).text(f[0], cx, cy, {lineBreak:false});
      doc.font(BB).fontSize(9).fillColor(TEXT).text(f[1], cx, cy+10, {lineBreak:false});
    });
    return y + H + 6;
  }

  private drawScheduleTable(doc: PDFKit.PDFDocument, y: number, schedule: any[]): number {
    y = this.drawSectionTitle(doc, y, 'TABLA DE AMORTIZACIÓN');
    const cols = [
      {label:'#',      w:50,  align:'center' as const},
      {label:'Fecha de pago', w:200, align:'center' as const},
      {label:'Monto',  w:150, align:'right'  as const},
    ];
    const tW = cols.reduce((s,c)=>s+c.w,0);
    const tX = (PW-tW)/2;
    const rH = 16, hH = 20;
    const contentBottom = PH - FOOTER_H - 20; // leave space for footer

    const drawHead = (atY: number): number => {
      let cx = tX;
      doc.rect(tX, atY, tW, hH).fill(GREEN);
      cols.forEach(c => {
        doc.font(BB).fontSize(7.5).fillColor(WHITE)
           .text(c.label, cx+3, atY+6, {width:c.w-6, align:c.align, lineBreak:false});
        cx += c.w;
      });
      return atY + hH + 1;
    };

    y = drawHead(y);

    schedule.forEach((row, idx) => {
      // Check if we need a new page
      if (y + rH > contentBottom) {
        doc.addPage();
        y = MT; // reset to top margin on new page
        y = drawHead(y);
      }

      doc.rect(tX, y, tW, rH).fill(idx%2===1 ? ALT : WHITE);
      const cells = [
        String(row.period),
        fdate(row.dueDate),
        cur(row.payment),
      ];
      let cx = tX;
      cells.forEach((cell, ci) => {
        doc.font(RB).fontSize(7.5).fillColor(TEXT)
           .text(cell, cx+3, y+4, {width:cols[ci].w-6, align:cols[ci].align, lineBreak:false});
        cx += cols[ci].w;
      });
      doc.moveTo(tX, y+rH).lineTo(tX+tW, y+rH).strokeColor(BORDER).lineWidth(0.3).stroke();
      y += rH;
    });

    return y + 8;
  }

  private drawSignatureSection(doc: PDFKit.PDFDocument, y: number, customer: string, guarantor?: string, legalText?: string) {
    // Cuadro de texto legal en el cuerpo del contrato
    if (legalText) {
      if (y + 60 > PH - FOOTER_H - 20) { doc.addPage(); y = MT; }
      y = this.drawSectionTitle(doc, y, 'INFORMACIÓN IMPORTANTE');
      const lines = legalText.split('\n').filter(l => l.trim());
      const boxH = Math.min(lines.length * 13 + 16, 120);
      doc.rect(ML, y, PW - ML*2, boxH).fillAndStroke('#FFFBEB', '#FDE68A');
      lines.forEach((line, li) => {
        if (y + 12 + li*13 < y + boxH - 4) {
          doc.font(RB).fontSize(7.5).fillColor(TEXT)
             .text(line.trim(), ML + 10, y + 8 + li*13,
               { width: PW - ML*2 - 20, lineBreak: false });
        }
      });
      y += boxH + 8;
    }

    if (y + 110 > PH - FOOTER_H - 20) {
      doc.addPage();
      y = MT;
    }
    y = this.drawSectionTitle(doc, y, 'FIRMAS');
    doc.font(RB).fontSize(7.5).fillColor(GRAY)
       .text('El acreditado declara haber leído y comprendido las condiciones del presente crédito.',
         ML, y, {width:PW-ML*2, align:'justify', lineBreak:false});
    y += 44;
    const sigW = (PW - ML*2 - 40) / 2;
    doc.moveTo(ML, y).lineTo(ML+sigW, y).strokeColor(TEXT).lineWidth(0.7).stroke();
    doc.font(BB).fontSize(7.5).fillColor(TEXT).text(customer.toUpperCase(), ML, y+4, {width:sigW,align:'center',lineBreak:false});
    doc.font(RB).fontSize(7).fillColor(GRAY).text('FIRMA DEL ACREDITADO', ML, y+14, {width:sigW,align:'center',lineBreak:false});

    const rx = ML + sigW + 40;
    doc.moveTo(rx, y).lineTo(rx+sigW, y).strokeColor(TEXT).lineWidth(0.7).stroke();
    if (guarantor) {
      doc.font(BB).fontSize(7.5).fillColor(TEXT).text(guarantor.toUpperCase(), rx, y+4, {width:sigW,align:'center',lineBreak:false});
      doc.font(RB).fontSize(7).fillColor(GRAY).text('FIRMA DEL AVAL', rx, y+14, {width:sigW,align:'center',lineBreak:false});
    } else {
      doc.font(RB).fontSize(7).fillColor(GRAY).text('FIRMA DEL EJECUTIVO / SELLO', rx, y+14, {width:sigW,align:'center',lineBreak:false});
    }
  }

  // ── TARJETA DE CONTROL DE PAGOS ──────────────────────────
  async generateControlCard(data: {
    loan: any;
    customer: any;
    guarantor?: any;
    companyName?: string;
    loanNumber?: number;
  }, res: Response): Promise<void> {
    // Tamaño tarjeta: 3.5" x 2" = 252 x 144 puntos aprox, usamos un poco más grande
    const W = 360, H = 200;
    const doc = new PDFDocument({ size: [W, H], margin: 0, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="tarjeta-${data.loan.id.substring(0,8)}.pdf"`);
    doc.pipe(res);

    const { loan, customer, guarantor, companyName, loanNumber } = data;
    const company = companyName || 'MICROCAPITAL - IXTEPEC';
    const freq    = loan.frequency || 'DIARIO';
    const unit    = freq2unit(freq).toUpperCase();
    const tipoPago = freq === 'DIARIO' ? 'DIARIO' : freq;

    // Borde exterior
    doc.rect(2, 2, W-4, H-4).stroke('#000000');

    // Encabezado verde
    doc.rect(2, 2, W-4, 28).fill(GREEN);
    doc.font(BB).fontSize(11).fillColor(WHITE)
       .text(company.toUpperCase(), 0, 8, { width: W, align: 'center', lineBreak: false });
    doc.font(RB).fontSize(7).fillColor('rgba(255,255,255,0.85)')
       .text('TARJETA DE CONTROL DE PAGOS', 0, 20, { width: W, align: 'center', lineBreak: false });

    // Cuerpo
    let y = 36;
    const lpad = 10;
    const col2 = W / 2;
    const lh = 14; // line height

    const line = (label: string, value: string, yy: number, full = false) => {
      doc.font(BB).fontSize(6.5).fillColor(GRAY)
         .text(label + ':', lpad, yy, { lineBreak: false });
      const labelW = doc.widthOfString(label + ':') + 4;
      doc.font(BB).fontSize(7.5).fillColor(TEXT)
         .text(value, lpad + labelW, yy, { width: (full ? W - lpad*2 : col2 - lpad) - labelW, lineBreak: false });
    };

    const lineTwo = (
      label1: string, val1: string,
      label2: string, val2: string,
      yy: number,
    ) => {
      line(label1, val1, yy);
      // right column
      doc.font(BB).fontSize(6.5).fillColor(GRAY)
         .text(label2 + ':', col2, yy, { lineBreak: false });
      const lw = doc.widthOfString(label2 + ':') + 4;
      doc.font(BB).fontSize(7.5).fillColor(TEXT)
         .text(val2, col2 + lw, yy, { width: W - col2 - lpad - lw, lineBreak: false });
    };

    // Calcular fecha de término (usando días hábiles aproximados)
    const disbDate = loan.disbursedAt ? new Date(loan.disbursedAt) : new Date();
    const endDate  = new Date(disbDate.getTime() + loan.termWeeks * 24*60*60*1000);

    line('CLIENTE', (customer.fullName || '—').toUpperCase(), y, true); y += lh;

    lineTwo(
      'AVAL', (guarantor?.fullName || '—').toUpperCase(),
      'CEL', guarantor?.phone || '—',
      y
    ); y += lh;

    line('TIPO DE CRÉDITO', 'INDIVIDUAL - AVAL', y, true); y += lh;

    lineTwo(
      'MONTO AUTORIZADO', cur(loan.principalAmount),
      '# DE CRÉDITO', loanNumber ? String(loanNumber).padStart(3,'0') : loan.id.substring(0,6).toUpperCase(),
      y
    ); y += lh;

    lineTwo(
      'PLAZO', `${loan.termWeeks} DÍAS HÁBILES`,
      'TIPO DE PAGO', tipoPago,
      y
    ); y += lh;

    lineTwo(
      'CUOTA', cur(loan.periodicPayment),
      'CEL', customer.phone || '—',
      y
    ); y += lh;

    lineTwo(
      'FECHA DE TÉRMINO', fdate(endDate),
      'TOTAL', cur(loan.totalAmount),
      y
    ); y += lh;

    // Línea separadora
    doc.moveTo(lpad, y+2).lineTo(W-lpad, y+2).strokeColor(BORDER).lineWidth(0.3).stroke();
    y += 8;

    // Pie
    doc.font(RB).fontSize(6).fillColor(GRAY)
       .text('Este documento es una tarjeta de control de pagos.', 0, y,
         { width: W, align: 'center', lineBreak: false });

    doc.end();
  }

  // ── FOOTER EN TODAS LAS PÁGINAS ───────────────────────────
  private addFootersToAllPages(doc: PDFKit.PDFDocument, company: string, legal: string|undefined, date: Date) {
    const range = (doc as any).bufferedPageRange();
    const total = range.count;
    const fy = PH - FOOTER_H;

    for (let i = 0; i < total; i++) {
      doc.switchToPage(range.start + i);
      doc.save();

      // Fondo del footer
      doc.rect(0, fy, PW, FOOTER_H + (legal ? 20 : 0)).fill(LGRAY);

      // Línea separadora superior
      doc.moveTo(ML, fy + 2).lineTo(PW - MR, fy + 2)
         .strokeColor(BORDER).lineWidth(0.5).stroke();

      let textY = fy + 6;

      // Texto legal — permitir hasta 2 líneas
      if (legal) {
        doc.font(RB).fontSize(6.5).fillColor(GRAY)
           .text(legal, ML, textY, {
             width: PW - ML*2,
             align: 'center',
             lineBreak: true,
             height: 18,
             ellipsis: true,
           });
        textY += 20;
      }

      // Empresa | fecha | página
      const label = `${company}  |  Generado el ${fdate(date)}`;
      doc.font(RB).fontSize(7).fillColor(GRAY)
         .text(label, ML, textY, { lineBreak: false });
      doc.font(RB).fontSize(7).fillColor(GRAY)
         .text(`Pág. ${i+1} / ${total}`, 0, textY,
           { width: PW - MR, align: 'right', lineBreak: false });

      doc.restore();
    }
  }
}