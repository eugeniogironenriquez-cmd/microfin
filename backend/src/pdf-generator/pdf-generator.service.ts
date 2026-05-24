import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import * as PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const COLORS = {
  primary:    '#1C4532',
  accent:     '#1C4532',
  accentDark: '#0d2b1e',
  success:    '#16A34A',
  danger:     '#DC2626',
  gray:       '#718096',
  lightGray:  '#F7FAFC',
  border:     '#CBD5E0',
  white:      '#FFFFFF',
  text:       '#171923',
  tableHead:  '#1C4532',
  tableAlt:   '#F0FFF4',
};
const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold' };

// Unidad de plazo según frecuencia
function unidadPlazo(freq: string): string {
  const map: Record<string, string> = {
    DIARIO: 'días', SEMANAL: 'semanas', QUINCENAL: 'quincenas', MENSUAL: 'meses',
  };
  return map[freq] ?? 'períodos';
}

@Injectable()
export class PdfGeneratorService {

  // ── PLAN DE PAGOS (SIMULACIÓN) ────────────────────────────
  async generateSimulationPdf(data: {
    principalAmount: number;
    interestRate: number;
    termWeeks: number;
    frequency: string;
    periodicPayment: number;
    totalPayment: number;
    totalInterest: number;
    schedule: Array<{ period: number; dueDate: Date | string; payment: number; principal: number; interest: number; balance: number }>;
    totalRate?: number;
    customerName?: string;
    guarantorName?: string;
    generatedAt?: Date;
    companyName?: string;
    legalFooter?: string;
  }, res: Response): Promise<void> {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="plan-pagos-${Date.now()}.pdf"`);
    doc.pipe(res);

    this.drawHeader(doc, data.companyName || 'Microcapital-Ixtepec',
      'PLAN DE PAGOS', 'Documento informativo, no constituye contrato');
    this.drawSummaryBox(doc, data);
    this.drawScheduleTable(doc, data.schedule);
    this.drawFooter(doc, data.generatedAt || new Date(),
      data.companyName || 'Microcapital-Ixtepec', data.legalFooter);
    // Volver a la última página real para evitar página en blanco al cerrar
    const simRange = (doc as any).bufferedPageRange();
    doc.switchToPage(simRange.start + simRange.count - 1);
    doc.end();
  }

  // ── CONTRATO OFICIAL ──────────────────────────────────────
  async generateLoanPdf(data: {
    loan: any;
    customer: any;
    loanType: any;
    schedules: any[];
    guarantor?: any;
    companyName?: string;
    legalFooter?: string;
  }, res: Response): Promise<void> {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contrato-${data.loan.id.substring(0,8)}.pdf"`);
    doc.pipe(res);

    this.drawHeader(doc, data.companyName || 'Microcapital-Ixtepec',
      'CONTRATO DE CRÉDITO', `Folio: ${data.loan.id.substring(0,8).toUpperCase()}`);
    this.drawCustomerInfo(doc, data.customer);
    if (data.guarantor) this.drawGuarantorInfo(doc, data.guarantor);
    this.drawLoanInfo(doc, data.loan, data.loanType);
    this.drawScheduleTable(doc, data.schedules.map((s: any) => ({
      period: s.periodNumber, dueDate: s.dueDate,
      payment: Number(s.totalDue), principal: Number(s.principalDue),
      interest: Number(s.interestDue), balance: Number(s.balanceDue),
    })));
    this.drawSignatureSection(doc, data.customer.fullName, data.guarantor?.fullName);
    this.drawFooter(doc, new Date(),
      data.companyName || 'Microcapital-Ixtepec', data.legalFooter);
    const loanRange = (doc as any).bufferedPageRange();
    doc.switchToPage(loanRange.start + loanRange.count - 1);
    doc.end();
  }

  // ── COMPROBANTE DE PAGO ───────────────────────────────────
  async generatePaymentReceipt(data: {
    payment: any; loan: any; company: any;
  }, res: Response): Promise<void> {
    const doc = new PDFDocument({ size: [612, 420], margin: 40, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="comprobante-${data.payment.id.substring(0,8)}.pdf"`);
    doc.pipe(res);

    const { payment, loan, company } = data;
    const customer = loan?.customer;
    const companyName = company?.name || 'Microcapital-Ixtepec';

    // Encabezado verde
    doc.rect(0, 0, doc.page.width, 65).fill(COLORS.tableHead);
    doc.font(FONT.bold).fontSize(16).fillColor('#FFFFFF').text(companyName, 40, 18);
    doc.font(FONT.regular).fontSize(7.5).fillColor('rgba(255,255,255,0.75)')
       .text(`RFC: ${company?.rfc || '—'}  |  Tel: ${company?.phone || '—'}`, 40, 40)
       .text(company?.address || '', 40, 52);
    doc.font(FONT.bold).fontSize(13).fillColor('#FFFFFF')
       .text('COMPROBANTE DE PAGO', 0, 22, { align: 'right', width: doc.page.width - 40 });
    doc.font(FONT.regular).fontSize(8).fillColor('rgba(255,255,255,0.75)')
       .text(`Folio: ${(payment.receiptNumber || payment.id?.substring(0,8) || '—').toUpperCase()}`, 0, 38, { align: 'right', width: doc.page.width - 40 })
       .text(`Fecha: ${this.formatDate(payment.paymentDate || new Date())}`, 0, 50, { align: 'right', width: doc.page.width - 40 });

    const y1 = 80;
    const half = (doc.page.width - 80) / 2;

    doc.rect(40, y1, half - 4, 80).fillAndStroke('#F7FAFC', COLORS.border);
    doc.font(FONT.bold).fontSize(8).fillColor(COLORS.accentDark).text('CLIENTE', 50, y1 + 8);
    doc.font(FONT.regular).fontSize(9).fillColor(COLORS.text)
       .text(customer?.fullName || '—', 50, y1 + 22)
       .fontSize(7.5).fillColor(COLORS.gray)
       .text(`CURP: ${customer?.curp || '—'}`, 50, y1 + 36)
       .text(`Tel: ${customer?.phone || '—'}`, 50, y1 + 48);

    const x2 = 40 + half + 4;
    doc.rect(x2, y1, half - 4, 80).fillAndStroke('#F7FAFC', COLORS.border);
    doc.font(FONT.bold).fontSize(8).fillColor(COLORS.accentDark).text('CRÉDITO', x2 + 10, y1 + 8);
    doc.font(FONT.regular).fontSize(8).fillColor(COLORS.text)
       .text(`ID: ${loan?.id?.substring(0,8).toUpperCase() || '—'}`, x2 + 10, y1 + 22)
       .text(`Tipo: ${loan?.loanType?.name || '—'}`, x2 + 10, y1 + 34)
       .text(`Cuota: ${this.currency(loan?.periodicPayment)}`, x2 + 10, y1 + 46);

    const y2 = y1 + 90;
    doc.rect(40, y2, doc.page.width - 80, 50).fillAndStroke('#F0FFF4', '#BBF7D0');
    doc.font(FONT.bold).fontSize(9).fillColor(COLORS.success).text('DETALLE DEL PAGO', 50, y2 + 8);
    const colW = (doc.page.width - 100) / 4;
    const cols = [
      ['Capital',   this.currency(payment.capitalApplied)],
      ['Interés',   this.currency(payment.interestApplied)],
      ['Moratorio', this.currency(payment.lateInterestApplied || 0)],
      ['Forma',     payment.method || 'EFECTIVO'],
    ];
    cols.forEach(([label, val], i) => {
      const cx = 50 + i * colW;
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text(label, cx, y2 + 24);
      doc.font(FONT.bold).fontSize(9).fillColor(COLORS.text).text(val, cx, y2 + 34);
    });

    const y3 = y2 + 60;
    doc.rect(40, y3, doc.page.width - 80, 38).fill(COLORS.tableHead);
    doc.font(FONT.regular).fontSize(11).fillColor(COLORS.white).text('TOTAL RECIBIDO:', 50, y3 + 12);
    doc.font(FONT.bold).fontSize(16).fillColor('#FFFFFF')
       .text(this.currency(payment.amountPaid), 0, y3 + 10, { align: 'right', width: doc.page.width - 50 });

    doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray)
       .text(company?.legalFooter || 'Este comprobante es un documento válido de pago.', 40, y3 + 56, {
         width: doc.page.width - 80, align: 'center',
       });

    doc.end();
  }

  // ── HEADER ────────────────────────────────────────────────
  private drawHeader(
    doc: PDFKit.PDFDocument,
    companyName: string,
    title: string,
    subtitle: string,
  ) {
    doc.rect(0, 0, doc.page.width, 78).fill(COLORS.tableHead);
    // Nombre de la empresa (izquierda)
    doc.font(FONT.bold).fontSize(16).fillColor('#FFFFFF').text(companyName, 50, 20);
    doc.font(FONT.regular).fontSize(7.5).fillColor('rgba(255,255,255,0.65)')
       .text('Sistema de Gestión Microfinanciera', 50, 42);
    // Título del documento (derecha)
    doc.font(FONT.bold).fontSize(13).fillColor('#FFFFFF')
       .text(title, 0, 24, { align: 'right', width: doc.page.width - 50 });
    doc.font(FONT.regular).fontSize(8).fillColor('rgba(255,255,255,0.75)')
       .text(subtitle, 0, 42, { align: 'right', width: doc.page.width - 50 });
    // Línea separadora
    doc.moveDown(0.5);
    doc.y = 90; // posición fija después del header para evitar solapamiento
  }

  // ── RESUMEN ───────────────────────────────────────────────
  private drawSummaryBox(doc: PDFKit.PDFDocument, data: any) {
    const y = doc.y;
    const freq = data.frequency || 'SEMANAL';
    const unidad = unidadPlazo(freq);

    doc.rect(50, y, doc.page.width - 100, 96).fillAndStroke(COLORS.lightGray, COLORS.border);
    doc.font(FONT.bold).fontSize(9).fillColor(COLORS.accentDark).text('RESUMEN DEL CRÉDITO', 65, y + 10);

    const cols = [
      ['Monto',      this.currency(data.principalAmount)],
      ['Tasa', data.totalRate ? `${(data.totalRate * 100).toFixed(0)}%` : `${(data.interestRate * 100).toFixed(2)}%`],
      ['Plazo',      `${data.termWeeks} ${unidad}`],
      ['Frecuencia', freq],
      ['Cuota',      this.currency(data.periodicPayment)],
      ['Total',      this.currency(data.totalPayment)],
      ['Intereses',  this.currency(data.totalInterest)],
    ];

    const cw = (doc.page.width - 120) / 4;
    cols.forEach((col, i) => {
      const cx = 65 + (i % 4) * cw;
      const cy = y + 28 + Math.floor(i / 4) * 30;
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text(col[0], cx, cy);
      doc.font(FONT.bold).fontSize(9).fillColor(COLORS.text).text(col[1], cx, cy + 11);
    });

    if (data.customerName) {
      doc.font(FONT.regular).fontSize(8).fillColor(COLORS.gray)
         .text(`Cliente: ${data.customerName}`, 65, y + 78);
    }
    doc.y = y + 100;
  }

  // ── DATOS DEL CLIENTE ─────────────────────────────────────
  private drawCustomerInfo(doc: PDFKit.PDFDocument, customer: any) {
    this.drawSectionTitle(doc, 'DATOS DEL ACREDITADO');
    const y = doc.y;
    doc.rect(50, y, doc.page.width - 100, 72).fillAndStroke(COLORS.lightGray, COLORS.border);
    const fields = [
      ['Nombre',    customer.fullName],
      ['CURP',      customer.curp],
      ['RFC',       customer.rfc || '—'],
      ['Teléfono',  customer.phone],
      ['Email',     customer.email || '—'],
      ['Domicilio', customer.address
        ? `${customer.address.street || ''}, ${customer.address.colonia || ''}, ${customer.address.municipality || ''}`.replace(/^,\s*|,\s*$/g, '')
        : '—'],
    ];
    const cw = (doc.page.width - 120) / 2;
    fields.forEach((f, i) => {
      const cx = 65 + (i % 2) * cw;
      const cy = y + 10 + Math.floor(i / 2) * 20;
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text(f[0], cx, cy);
      doc.font(FONT.bold).fontSize(8).fillColor(COLORS.text)
         .text(f[1], cx, cy + 9, { width: cw - 10, lineBreak: false });
    });
    doc.y = y + 76;
  }

  // ── AVAL ──────────────────────────────────────────────────
  private drawGuarantorInfo(doc: PDFKit.PDFDocument, guarantor: any) {
    this.drawSectionTitle(doc, 'DATOS DEL AVAL');
    const y = doc.y;
    doc.rect(50, y, doc.page.width - 100, 56).fillAndStroke('#F0FFF4', '#BBF7D0');
    const fields = [
      ['Nombre',    guarantor.fullName],
      ['CURP',      guarantor.curp],
      ['Teléfono',  guarantor.phone],
      ['Parentesco',guarantor.relationship || '—'],
      ['Domicilio', guarantor.address || '—'],
    ];
    const cw = (doc.page.width - 120) / 3;
    fields.forEach((f, i) => {
      const cx = 65 + (i % 3) * cw;
      const cy = y + 10 + Math.floor(i / 3) * 20;
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text(f[0], cx, cy);
      doc.font(FONT.bold).fontSize(8).fillColor(COLORS.text)
         .text(f[1], cx, cy + 9, { width: cw - 10, lineBreak: false });
    });
    doc.y = y + 62;
  }

  // ── INFO DEL PRÉSTAMO ─────────────────────────────────────
  private drawLoanInfo(doc: PDFKit.PDFDocument, loan: any, loanType: any) {
    this.drawSectionTitle(doc, 'CONDICIONES DEL CRÉDITO');
    const y = doc.y;
    const freq   = loan.frequency || 'SEMANAL';
    const unidad = unidadPlazo(freq);

    doc.rect(50, y, doc.page.width - 100, 72).fillAndStroke(COLORS.lightGray, COLORS.border);
    const fields = [
      ['Tipo',       loanType.name],
      ['Monto',      this.currency(loan.principalAmount)],
      ['Tasa',       `${(Number(loan.interestRate) * 100).toFixed(2)}%`],
      ['Plazo',      `${loan.termWeeks} ${unidad}`],
      ['Frecuencia', freq],
      ['Cuota',      this.currency(loan.periodicPayment)],
      ['Total',      this.currency(loan.totalAmount)],
      ['Desembolso', this.formatDate(loan.disbursedAt)],
    ];
    const cw = (doc.page.width - 120) / 4;
    fields.forEach((f, i) => {
      const cx = 65 + (i % 4) * cw;
      const cy = y + 10 + Math.floor(i / 4) * 28;
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text(f[0], cx, cy);
      doc.font(FONT.bold).fontSize(9).fillColor(COLORS.text).text(f[1], cx, cy + 11);
    });
    doc.y = y + 76;
  }

  // ── TABLA DE AMORTIZACIÓN ─────────────────────────────────
  private drawScheduleTable(doc: PDFKit.PDFDocument, schedule: any[]) {
    this.drawSectionTitle(doc, 'TABLA DE AMORTIZACIÓN');

    const cols = [
      { label: '#',       width: 28,  align: 'center' as const },
      { label: 'Vence',   width: 72,  align: 'center' as const },
      { label: 'Cuota',   width: 72,  align: 'right'  as const },
      { label: 'Capital', width: 72,  align: 'right'  as const },
      { label: 'Interés', width: 72,  align: 'right'  as const },
      { label: 'Saldo',   width: 80,  align: 'right'  as const },
    ];
    const tableW = cols.reduce((s, c) => s + c.width, 0);
    const tableX = (doc.page.width - tableW) / 2;
    const rowH   = 16;
    const headerH = 20;

    const drawTableHeader = () => {
      const hy = doc.y;
      let cx = tableX;
      doc.rect(tableX, hy, tableW, headerH).fill(COLORS.tableHead);
      cols.forEach(col => {
        doc.font(FONT.bold).fontSize(7.5).fillColor(COLORS.white)
           .text(col.label, cx + 3, hy + 6, { width: col.width - 6, align: col.align, lineBreak: false });
        cx += col.width;
      });
      doc.y = hy + headerH + 2;  // posición exacta tras cabecera
    };

    drawTableHeader();

    schedule.forEach((row, idx) => {
      if (doc.y + rowH > doc.page.height - 60) {
        doc.addPage();
        drawTableHeader();
      }
      const rowY = doc.y;
      doc.rect(tableX, rowY, tableW, rowH)
         .fill(idx % 2 === 1 ? COLORS.tableAlt : COLORS.white);

      const cells = [
        String(row.period),
        this.formatDate(row.dueDate),
        this.currency(row.payment),
        this.currency(row.principal),
        this.currency(row.interest),
        this.currency(row.balance),
      ];
      let cx = tableX;
      cells.forEach((cell, ci) => {
        doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.text)
           .text(cell, cx + 3, rowY + 4, { width: cols[ci].width - 6, align: cols[ci].align, lineBreak: false });
        cx += cols[ci].width;
      });
      doc.moveTo(tableX, rowY + rowH)
         .lineTo(tableX + tableW, rowY + rowH)
         .strokeColor(COLORS.border).lineWidth(0.3).stroke();
      doc.y = rowY + rowH;
    });
    // No moveDown al final — evita espacio extra que causa páginas en blanco
  }

  // ── FIRMAS ────────────────────────────────────────────────
  private drawSignatureSection(
    doc: PDFKit.PDFDocument,
    customerName: string,
    guarantorName?: string,
  ) {
    if (doc.y + 120 > doc.page.height - 60) doc.addPage();
    this.drawSectionTitle(doc, 'FIRMAS');
    const y = doc.y;
    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.gray)
       .text('El acreditado declara haber leído y comprendido las condiciones del presente crédito.',
         50, y, { width: doc.page.width - 100, align: 'justify' });
    doc.moveDown(2.5);
    const sigY = doc.y;
    const sigW = (doc.page.width - 140) / 2;

    doc.moveTo(50, sigY + 35).lineTo(50 + sigW, sigY + 35)
       .strokeColor(COLORS.text).lineWidth(0.7).stroke();
    doc.font(FONT.bold).fontSize(7.5).fillColor(COLORS.text)
       .text(customerName.toUpperCase(), 50, sigY + 38, { width: sigW, align: 'center' });
    doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray)
       .text('FIRMA DEL ACREDITADO', 50, sigY + 50, { width: sigW, align: 'center' });

    const rightX = 90 + sigW;
    doc.moveTo(rightX, sigY + 35).lineTo(rightX + sigW, sigY + 35)
       .strokeColor(COLORS.text).lineWidth(0.7).stroke();
    if (guarantorName) {
      doc.font(FONT.bold).fontSize(7.5).fillColor(COLORS.text)
         .text(guarantorName.toUpperCase(), rightX, sigY + 38, { width: sigW, align: 'center' });
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray)
         .text('FIRMA DEL AVAL', rightX, sigY + 50, { width: sigW, align: 'center' });
    } else {
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray)
         .text('FIRMA DEL EJECUTIVO / SELLO', rightX, sigY + 50, { width: sigW, align: 'center' });
    }
    doc.y = sigY + 70;
  }

  // ── TÍTULO DE SECCIÓN ─────────────────────────────────────
  private drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
    const y = doc.y + 8;
    doc.rect(50, y, 4, 14).fill(COLORS.accent);
    doc.font(FONT.bold).fontSize(9).fillColor(COLORS.accentDark)
       .text(title, 60, y + 2, { lineBreak: false });
    const lineY = y + 16;
    doc.moveTo(50, lineY).lineTo(doc.page.width - 50, lineY)
       .strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.y = lineY + 6;  // posición exacta después del título
  }

  // ── PIE DE PÁGINA ─────────────────────────────────────────
  private drawFooter(
    doc: PDFKit.PDFDocument,
    date: Date,
    companyName: string,
    legalFooter?: string,
  ) {
    const range = (doc as any).bufferedPageRange();
    const count = range.count;
    for (let i = 0; i < count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 44;
      doc.rect(0, footerY - 4, doc.page.width, 48).fill(COLORS.lightGray);

      // Texto legal (pie de página de empresa) si existe
      if (legalFooter) {
        doc.font(FONT.regular).fontSize(6.5).fillColor(COLORS.gray)
           .text(legalFooter, 50, footerY + 2,
             { width: doc.page.width - 100, align: 'center' });
      }

      // Línea inferior: empresa | fecha | página
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray)
         .text(
           `${companyName} | Generado el ${this.formatDate(date)}`,
           50, footerY + (legalFooter ? 14 : 6),
           { align: 'left' }
         )
         .text(
           `Página ${i + 1} de ${count}`,
           0, footerY + (legalFooter ? 14 : 6),
           { align: 'right', width: doc.page.width - 50 }
         );
    }
  }

  // ── UTILIDADES ────────────────────────────────────────────
  private currency(value: number | string | undefined): string {
    const n = Number(value) || 0;
    return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatDate(date: Date | string | undefined): string {
    if (!date) return '—';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return format(d, 'dd/MM/yyyy', { locale: es });
    } catch { return String(date); }
  }
}