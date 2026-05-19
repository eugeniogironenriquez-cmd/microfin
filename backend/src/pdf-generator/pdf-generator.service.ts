import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import * as PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const COLORS = {
  primary:     '#1C1917',
  accent:      '#F59E0B',
  accentDark:  '#D97706',
  success:     '#16A34A',
  danger:      '#DC2626',
  gray:        '#78716C',
  lightGray:   '#FAFAF9',
  border:      '#E7E5E4',
  white:       '#FFFFFF',
  text:        '#1C1917',
  tableHead:   '#292524',
  tableAlt:    '#FEF9EE',
};
const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold' };

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
    customerName?: string;
    guarantorName?: string;
    generatedAt?: Date;
  }, res: Response): Promise<void> {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="plan-pagos-${Date.now()}.pdf"`);
    doc.pipe(res);

    this.drawHeader(doc, 'PLAN DE PAGOS — SIMULACIÓN', 'Documento informativo, no constituye contrato');
    this.drawSummaryBox(doc, data);
    this.drawScheduleTable(doc, data.schedule);
    this.drawFooter(doc, data.generatedAt || new Date());
    doc.end();
  }

  // ── CONTRATO OFICIAL ──────────────────────────────────────
  async generateLoanPdf(data: {
    loan: any;
    customer: any;
    loanType: any;
    schedules: any[];
    guarantor?: any;
  }, res: Response): Promise<void> {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contrato-${data.loan.id.substring(0,8)}.pdf"`);
    doc.pipe(res);

    this.drawHeader(doc, 'CONTRATO DE CRÉDITO', `Folio: ${data.loan.id.substring(0,8).toUpperCase()}`);
    this.drawCustomerInfo(doc, data.customer);
    if (data.guarantor) this.drawGuarantorInfo(doc, data.guarantor);
    this.drawLoanInfo(doc, data.loan, data.loanType);
    this.drawScheduleTable(doc, data.schedules.map((s: any) => ({
      period: s.periodNumber, dueDate: s.dueDate,
      payment: Number(s.totalDue), principal: Number(s.principalDue),
      interest: Number(s.interestDue), balance: Number(s.balanceDue),
    })));
    this.drawSignatureSection(doc, data.customer.fullName, data.guarantor?.fullName);
    this.drawFooter(doc, new Date());
    doc.end();
  }

  // ── COMPROBANTE DE PAGO ───────────────────────────────────
  async generatePaymentReceipt(data: {
    payment: any;
    loan: any;
    company: any;
  }, res: Response): Promise<void> {
    const doc = new PDFDocument({ size: [612, 400], margin: 40, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="comprobante-${data.payment.id.substring(0,8)}.pdf"`);
    doc.pipe(res);

    const { payment, loan, company } = data;
    const customer = loan?.customer;

    // Encabezado
    doc.rect(0, 0, doc.page.width, 65).fill(COLORS.tableHead);
    doc.font(FONT.bold).fontSize(18).fillColor(COLORS.accent)
       .text(company?.name || 'MicroFin', 40, 18);
    doc.font(FONT.regular).fontSize(8).fillColor('#D1D5DB')
       .text(`RFC: ${company?.rfc || '—'}  |  Tel: ${company?.phone || '—'}`, 40, 40)
       .text(company?.address || '', 40, 52);
    doc.font(FONT.bold).fontSize(13).fillColor(COLORS.white)
       .text('COMPROBANTE DE PAGO', 0, 22, { align: 'right', width: doc.page.width - 40 });
    doc.font(FONT.regular).fontSize(8).fillColor('#D1D5DB')
       .text(`Folio: ${(payment.receiptNumber || payment.id?.substring(0,8) || '—').toUpperCase()}`, 0, 38, { align: 'right', width: doc.page.width - 40 })
       .text(`Fecha: ${this.formatDate(payment.paymentDate || new Date())}`, 0, 50, { align: 'right', width: doc.page.width - 40 });

    // Datos
    const y1 = 80;
    const half = (doc.page.width - 80) / 2;

    doc.rect(40, y1, half - 4, 80).fillAndStroke('#FAFAF9', COLORS.border);
    doc.font(FONT.bold).fontSize(8).fillColor(COLORS.accentDark).text('CLIENTE', 50, y1 + 8);
    doc.font(FONT.regular).fontSize(9).fillColor(COLORS.text)
       .text(customer?.fullName || '—', 50, y1 + 22)
       .fontSize(7.5).fillColor(COLORS.gray)
       .text(`CURP: ${customer?.curp || '—'}`, 50, y1 + 36)
       .text(`Tel: ${customer?.phone || '—'}`, 50, y1 + 48);

    const x2 = 40 + half + 4;
    doc.rect(x2, y1, half - 4, 80).fillAndStroke('#FAFAF9', COLORS.border);
    doc.font(FONT.bold).fontSize(8).fillColor(COLORS.accentDark).text('CRÉDITO', x2 + 10, y1 + 8);
    doc.font(FONT.regular).fontSize(8).fillColor(COLORS.text)
       .text(`ID: ${loan?.id?.substring(0,8).toUpperCase() || '—'}`, x2 + 10, y1 + 22)
       .text(`Tipo: ${loan?.loanType?.name || '—'}`, x2 + 10, y1 + 34)
       .text(`Cuota: ${this.currency(loan?.periodicPayment)}`, x2 + 10, y1 + 46);

    // Detalle
    const y2 = y1 + 90;
    doc.rect(40, y2, doc.page.width - 80, 50).fillAndStroke('#F0FDF4', '#BBF7D0');
    doc.font(FONT.bold).fontSize(9).fillColor(COLORS.success).text('DETALLE DEL PAGO', 50, y2 + 8);
    const colW = (doc.page.width - 100) / 4;
    const cols = [
      ['Capital', this.currency(payment.capitalApplied)],
      ['Interés', this.currency(payment.interestApplied)],
      ['Moratorio', this.currency(payment.lateInterestApplied || 0)],
      ['Forma', payment.method || 'EFECTIVO'],
    ];
    cols.forEach(([label, val], i) => {
      const cx = 50 + i * colW;
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text(label, cx, y2 + 24);
      doc.font(FONT.bold).fontSize(9).fillColor(COLORS.text).text(val, cx, y2 + 34);
    });

    // Total
    const y3 = y2 + 60;
    doc.rect(40, y3, doc.page.width - 80, 38).fill(COLORS.tableHead);
    doc.font(FONT.regular).fontSize(11).fillColor(COLORS.white).text('TOTAL RECIBIDO:', 50, y3 + 12);
    doc.font(FONT.bold).fontSize(16).fillColor(COLORS.accent)
       .text(this.currency(payment.amountPaid), 0, y3 + 10, { align: 'right', width: doc.page.width - 50 });

    // Pie
    doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray)
       .text(company?.legalFooter || 'Este comprobante es un documento válido de pago.', 40, y3 + 56, {
         width: doc.page.width - 80, align: 'center',
       });

    doc.end();
  }

  // ── HELPERS PRIVADOS ──────────────────────────────────────
  private drawHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
    doc.rect(0, 0, doc.page.width, 78).fill(COLORS.tableHead);
    doc.font(FONT.bold).fontSize(20).fillColor(COLORS.accent).text('MicroFin', 50, 22);
    doc.font(FONT.regular).fontSize(8).fillColor('#D1D5DB').text('Sistema de Gestión Microfinanciera', 50, 46);
    doc.font(FONT.bold).fontSize(13).fillColor(COLORS.white)
       .text(title, 0, 25, { align: 'right', width: doc.page.width - 50 });
    doc.font(FONT.regular).fontSize(8).fillColor('#D1D5DB')
       .text(subtitle, 0, 44, { align: 'right', width: doc.page.width - 50 });
    doc.moveDown(3);
  }

  private drawSummaryBox(doc: PDFKit.PDFDocument, data: any) {
    const y = doc.y;
    doc.rect(50, y, doc.page.width - 100, 90).fillAndStroke(COLORS.lightGray, COLORS.border);
    doc.font(FONT.bold).fontSize(9).fillColor(COLORS.accentDark).text('RESUMEN DEL CRÉDITO', 65, y + 10);
    const cols = [
      ['Monto', this.currency(data.principalAmount)],
      ['Tasa', `${(data.interestRate * 100).toFixed(2)}%`],
      ['Plazo', `${data.termWeeks} sem.`],
      ['Frecuencia', data.frequency],
      ['Cuota', this.currency(data.periodicPayment)],
      ['Total', this.currency(data.totalPayment)],
      ['Intereses', this.currency(data.totalInterest)],
    ];
    const cw = (doc.page.width - 120) / 4;
    cols.forEach((col, i) => {
      const cx = 65 + (i % 4) * cw;
      const cy = y + 28 + Math.floor(i / 4) * 28;
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text(col[0], cx, cy);
      doc.font(FONT.bold).fontSize(9).fillColor(COLORS.text).text(col[1], cx, cy + 10);
    });
    if (data.customerName) {
      doc.font(FONT.regular).fontSize(8).fillColor(COLORS.gray)
         .text(`Cliente: ${data.customerName}`, 65, y + 74);
    }
    doc.y = y + 100;
  }

  private drawCustomerInfo(doc: PDFKit.PDFDocument, customer: any) {
    this.drawSectionTitle(doc, 'DATOS DEL ACREDITADO');
    const y = doc.y;
    doc.rect(50, y, doc.page.width - 100, 72).fillAndStroke(COLORS.lightGray, COLORS.border);
    const fields = [
      ['Nombre', customer.fullName], ['CURP', customer.curp],
      ['RFC', customer.rfc || '—'], ['Teléfono', customer.phone],
      ['Email', customer.email || '—'],
      ['Domicilio', customer.address ? `${customer.address.street}, ${customer.address.colonia}, ${customer.address.municipality}` : '—'],
    ];
    const cw = (doc.page.width - 120) / 2;
    fields.forEach((f, i) => {
      const cx = 65 + (i % 2) * cw;
      const cy = y + 10 + Math.floor(i / 2) * 20;
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text(f[0], cx, cy);
      doc.font(FONT.bold).fontSize(8).fillColor(COLORS.text).text(f[1], cx, cy + 9, { width: cw - 10, lineBreak: false });
    });
    doc.y = y + 82;
  }

  private drawGuarantorInfo(doc: PDFKit.PDFDocument, guarantor: any) {
    this.drawSectionTitle(doc, 'DATOS DEL AVAL');
    const y = doc.y;
    doc.rect(50, y, doc.page.width - 100, 56).fillAndStroke('#FFFBEB', '#FDE68A');
    const fields = [
      ['Nombre', guarantor.fullName], ['CURP', guarantor.curp],
      ['Teléfono', guarantor.phone], ['Parentesco', guarantor.relationship || '—'],
      ['Domicilio', guarantor.address || '—'],
    ];
    const cw = (doc.page.width - 120) / 3;
    fields.forEach((f, i) => {
      const cx = 65 + (i % 3) * cw;
      const cy = y + 10 + Math.floor(i / 3) * 20;
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text(f[0], cx, cy);
      doc.font(FONT.bold).fontSize(8).fillColor(COLORS.text).text(f[1], cx, cy + 9, { width: cw - 10, lineBreak: false });
    });
    doc.y = y + 66;
  }

  private drawLoanInfo(doc: PDFKit.PDFDocument, loan: any, loanType: any) {
    this.drawSectionTitle(doc, 'CONDICIONES DEL CRÉDITO');
    const y = doc.y;
    doc.rect(50, y, doc.page.width - 100, 72).fillAndStroke(COLORS.lightGray, COLORS.border);
    const fields = [
      ['Tipo', loanType.name], ['Monto', this.currency(loan.principalAmount)],
      ['Tasa', `${(Number(loan.interestRate) * 100).toFixed(2)}%`],
      ['Plazo', `${loan.termWeeks} semanas`],
      ['Frecuencia', loan.frequency], ['Cuota', this.currency(loan.periodicPayment)],
      ['Total', this.currency(loan.totalAmount)], ['Desembolso', this.formatDate(loan.disbursedAt)],
    ];
    const cw = (doc.page.width - 120) / 4;
    fields.forEach((f, i) => {
      const cx = 65 + (i % 4) * cw;
      const cy = y + 10 + Math.floor(i / 4) * 28;
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text(f[0], cx, cy);
      doc.font(FONT.bold).fontSize(9).fillColor(COLORS.text).text(f[1], cx, cy + 11);
    });
    doc.y = y + 82;
  }

  private drawScheduleTable(doc: PDFKit.PDFDocument, schedule: any[]) {
    this.drawSectionTitle(doc, 'TABLA DE AMORTIZACIÓN');
    const cols = [
      { label: '#', width: 28, align: 'center' as const },
      { label: 'Vence', width: 72, align: 'center' as const },
      { label: 'Cuota', width: 72, align: 'right' as const },
      { label: 'Capital', width: 72, align: 'right' as const },
      { label: 'Interés', width: 72, align: 'right' as const },
      { label: 'Saldo', width: 80, align: 'right' as const },
    ];
    const tableW = cols.reduce((s, c) => s + c.width, 0);
    const tableX = (doc.page.width - tableW) / 2;
    const rowH = 16;
    const headerH = 20;

    const drawHeader = () => {
      let cx = tableX;
      doc.rect(tableX, doc.y, tableW, headerH).fill(COLORS.tableHead);
      cols.forEach(col => {
        doc.font(FONT.bold).fontSize(7.5).fillColor(COLORS.white)
           .text(col.label, cx + 3, doc.y - headerH + 6, { width: col.width - 6, align: col.align });
        cx += col.width;
      });
      doc.y += 2;
    };

    drawHeader();

    schedule.forEach((row, idx) => {
      if (doc.y + rowH > doc.page.height - 80) {
        doc.addPage();
        drawHeader();
      }
      const rowY = doc.y;
      doc.rect(tableX, rowY, tableW, rowH).fill(idx % 2 === 1 ? COLORS.tableAlt : COLORS.white);
      const cells = [
        String(row.period), this.formatDate(row.dueDate),
        this.currency(row.payment), this.currency(row.principal),
        this.currency(row.interest), this.currency(row.balance),
      ];
      let cx = tableX;
      cells.forEach((cell, ci) => {
        doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.text)
           .text(cell, cx + 3, rowY + 4, { width: cols[ci].width - 6, align: cols[ci].align });
        cx += cols[ci].width;
      });
      doc.moveTo(tableX, rowY + rowH).lineTo(tableX + tableW, rowY + rowH)
         .strokeColor(COLORS.border).lineWidth(0.3).stroke();
      doc.y = rowY + rowH;
    });
    doc.moveDown(1.5);
  }

  private drawSignatureSection(doc: PDFKit.PDFDocument, customerName: string, guarantorName?: string) {
    if (doc.y + 120 > doc.page.height - 60) doc.addPage();
    this.drawSectionTitle(doc, 'FIRMAS');
    const y = doc.y;
    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.gray)
       .text('El acreditado declara haber leído y comprendido las condiciones del presente crédito.', 50, y, { width: doc.page.width - 100, align: 'justify' });
    doc.moveDown(2.5);
    const sigY = doc.y;
    const sigW = (doc.page.width - 140) / 2;

    doc.moveTo(50, sigY + 35).lineTo(50 + sigW, sigY + 35).strokeColor(COLORS.text).lineWidth(0.7).stroke();
    doc.font(FONT.bold).fontSize(7.5).fillColor(COLORS.text).text(customerName.toUpperCase(), 50, sigY + 38, { width: sigW, align: 'center' });
    doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text('FIRMA DEL ACREDITADO', 50, sigY + 50, { width: sigW, align: 'center' });

    const rightX = 90 + sigW;
    doc.moveTo(rightX, sigY + 35).lineTo(rightX + sigW, sigY + 35).strokeColor(COLORS.text).lineWidth(0.7).stroke();
    if (guarantorName) {
      doc.font(FONT.bold).fontSize(7.5).fillColor(COLORS.text).text(guarantorName.toUpperCase(), rightX, sigY + 38, { width: sigW, align: 'center' });
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text('FIRMA DEL AVAL', rightX, sigY + 50, { width: sigW, align: 'center' });
    } else {
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray).text('FIRMA DEL EJECUTIVO / SELLO', rightX, sigY + 50, { width: sigW, align: 'center' });
    }
    doc.y = sigY + 70;
  }

  private drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
    doc.moveDown(0.5);
    const y = doc.y;
    doc.rect(50, y, 4, 14).fill(COLORS.accent);
    doc.font(FONT.bold).fontSize(9).fillColor(COLORS.accentDark).text(title, 60, y + 1);
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.moveDown(0.4);
  }

  private drawFooter(doc: PDFKit.PDFDocument, date: Date) {
    const range = (doc as any).bufferedPageRange();
    const count = range.count;
    for (let i = 0; i < count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 38;
      doc.rect(0, footerY - 4, doc.page.width, 42).fill(COLORS.lightGray);
      doc.font(FONT.regular).fontSize(7).fillColor(COLORS.gray)
         .text(`Generado el ${this.formatDate(date)} | MicroFin — Sistema de Gestión Microfinanciera`, 50, footerY + 4, { align: 'left' })
         .text(`Página ${i + 1} de ${count}`, 0, footerY + 4, { align: 'right', width: doc.page.width - 50 });
    }
  }

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
