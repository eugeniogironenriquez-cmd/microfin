import {
  Injectable, Controller, Get, Param, Res, Query, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthPermission } from '../common/guards/roles.guard';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import * as PDFDocument from 'pdfkit';
import {
  Customer, Loan, PaymentSchedule, ScheduleStatus,
} from '../common/entities';
import { CompanyService } from '../company/company.module';

/**
 * Historial del cliente a la fecha de hoy: todos sus créditos con el desglose
 * de cuotas, atrasos y moratorios pendientes. Se imprime en PDF o Excel desde
 * el detalle del cliente.
 */
@Injectable()
export class ClientHistoryService {
  constructor(
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
    private companyService: CompanyService,
  ) {}

  // Día de hoy en zona de México (a medianoche UTC del día-calendario MX),
  // para comparar vencimientos sin que la zona del servidor corra el día.
  private hoyMexicoUTC(): number {
    const MX = 6 * 60 * 60 * 1000;
    const now = new Date(Date.now() - MX);
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }

  private diasAtraso(dueDate: Date, hoyUTC: number): number {
    const d = new Date(dueDate);
    const dueUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const diff = Math.floor((hoyUTC - dueUTC) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  async getClientHistory(customerId: string, incluirLiquidados = true) {
    const customer = await this.customerRepo.findOne({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    let loans = await this.loanRepo.find({
      where: { customerId },
      relations: ['loanType'],
      order: { createdAt: 'DESC' },
    });

    // Filtro opcional: al desactivar "Incluir liquidados" se ocultan los
    // créditos que ya no están vigentes: los LIQUIDADOS y los REESTRUCTURADOS
    // (estos últimos fueron reemplazados por un crédito nuevo).
    if (!incluirLiquidados) {
      loans = loans.filter(
        (l) => l.status !== 'LIQUIDADO' && l.status !== 'REESTRUCTURADO',
      );
    }

    const hoyUTC = this.hoyMexicoUTC();

    const creditos = [];
    for (const loan of loans) {
      const schedules = await this.scheduleRepo.find({
        where: { loanId: loan.id },
        order: { periodNumber: 'ASC' },
      });

      const cuotas = schedules.map((s) => {
        const moraGen = Number(s.moraGenerada || 0);
        const moraPag = Number(s.moraPagada || 0);
        const moraPend = Math.max(0, Math.round((moraGen - moraPag) * 100) / 100);
        const pagada = s.status === ScheduleStatus.PAGADO;
        const atraso = pagada ? 0 : this.diasAtraso(s.dueDate, hoyUTC);
        return {
          periodo: s.periodNumber,
          vence: s.dueDate,
          cuota: Number(s.totalDue || 0),
          saldo: Number(s.balanceDue || 0),
          estatus: s.status,
          diasAtraso: atraso,
          moraGenerada: moraGen,
          moraPagada: moraPag,
          moraPendiente: moraPend,
          pagada,
        };
      });

      // Resumen del crédito
      const saldoPendiente = cuotas
        .filter((c) => !c.pagada)
        .reduce((s, c) => s + c.saldo, 0);
      const moraPendienteTotal = cuotas.reduce((s, c) => s + c.moraPendiente, 0);
      const cuotasVencidas = cuotas.filter((c) => !c.pagada && c.diasAtraso > 0).length;
      const cuotasPagadas = cuotas.filter((c) => c.pagada).length;

      creditos.push({
        id: loan.id,
        tipo: loan.loanType?.name || '',
        estatus: loan.status,
        montoPrincipal: Number(loan.principalAmount || 0),
        totalAmount: Number(loan.totalAmount || 0),
        cuotaPeriodica: Number(loan.periodicPayment || 0),
        plazo: loan.termWeeks,
        desembolsadoEn: loan.disbursedAt,
        creadoEn: loan.createdAt,
        cuotas,
        resumen: {
          saldoPendiente: Math.round(saldoPendiente * 100) / 100,
          moraPendiente: Math.round(moraPendienteTotal * 100) / 100,
          cuotasVencidas,
          cuotasPagadas,
          totalCuotas: cuotas.length,
        },
      });
    }

    // Totales globales del cliente
    const totales = creditos.reduce(
      (acc, c) => {
        acc.saldoPendiente += c.resumen.saldoPendiente;
        acc.moraPendiente += c.resumen.moraPendiente;
        acc.creditos += 1;
        return acc;
      },
      { saldoPendiente: 0, moraPendiente: 0, creditos: 0 },
    );
    totales.saldoPendiente = Math.round(totales.saldoPendiente * 100) / 100;
    totales.moraPendiente = Math.round(totales.moraPendiente * 100) / 100;

    return {
      cliente: {
        id: customer.id,
        nombre: customer.fullName,
        curp: (customer as any).curp || '',
        telefono: (customer as any).phone || '',
      },
      generadoEn: new Date(),
      creditos,
      totales,
    };
  }

  private fechaMx(fecha: Date | string): string {
    if (!fecha) return '';
    const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getUTCFullYear()}`;
  }

  private money(n: number): string {
    return Number(n || 0).toLocaleString('es-MX', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  // ── PDF ────────────────────────────────────────────────────
  async generatePdf(customerId: string, res: Response, incluirLiquidados = true): Promise<void> {
    const data = await this.getClientHistory(customerId, incluirLiquidados);
    const company = await this.companyService.get().catch(() => null);

    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 40, right: 40 }, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="historial-${data.cliente.nombre.replace(/\s+/g, '-').toLowerCase()}.pdf"`);
    doc.pipe(res);

    const PW = doc.page.width;
    const ML = 40;
    const CW = PW - 80;
    const BLUE = '#2795f5';
    const GRAY = '#718096';
    const DARK = '#171923';

    // Encabezado azul
    doc.rect(0, 0, PW, 70).fill(BLUE);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(15)
      .text(company?.name || 'Microcapital-Ixtepec', ML, 18, { lineBreak: false });
    doc.font('Helvetica').fontSize(8)
      .fillColor('rgba(255,255,255,0.85)')
      .text([company?.address, company?.city, company?.state].filter(Boolean).join(', '), ML, 40, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#fff')
      .text('HISTORIAL DEL CLIENTE', 0, 22, { width: PW - ML, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor('rgba(255,255,255,0.85)')
      .text(`Generado: ${this.fechaMx(data.generadoEn)}`, 0, 42, { width: PW - ML, align: 'right', lineBreak: false });

    doc.y = 90;

    // Datos del cliente
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text(data.cliente.nombre, ML, doc.y);
    doc.font('Helvetica').fontSize(9).fillColor(GRAY);
    const datosLinea = [
      data.cliente.curp ? `CURP: ${data.cliente.curp}` : '',
      data.cliente.telefono ? `Tel: ${data.cliente.telefono}` : '',
    ].filter(Boolean).join('    ');
    if (datosLinea) doc.text(datosLinea, ML, doc.y + 2);
    doc.moveDown(0.5);

    // Resumen global
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK);
    doc.text(
      `Créditos: ${data.totales.creditos}    ` +
      `Saldo pendiente total: $${this.money(data.totales.saldoPendiente)}    ` +
      `Mora pendiente total: $${this.money(data.totales.moraPendiente)}`,
      ML, doc.y,
    );
    doc.moveDown(1);

    // Cada crédito
    for (const credito of data.creditos) {
      // Salto de página si no cabe el encabezado del crédito
      if (doc.y + 80 > doc.page.height - 60) { doc.addPage(); doc.y = 50; }

      // Barra de título del crédito
      const barY = doc.y;
      doc.rect(ML, barY, CW, 20).fill('#EFF6FF');
      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9)
        .text(`Crédito ${credito.id.substring(0, 8).toUpperCase()}  ·  ${credito.tipo}  ·  ${credito.estatus}`, ML + 6, barY + 6, { lineBreak: false });
      doc.y = barY + 26;

      // Datos del crédito
      doc.font('Helvetica').fontSize(8).fillColor(GRAY);
      doc.text(
        `Monto: $${this.money(credito.montoPrincipal)}   ` +
        `Total: $${this.money(credito.totalAmount)}   ` +
        `Cuota: $${this.money(credito.cuotaPeriodica)}   ` +
        `Plazo: ${credito.plazo}   ` +
        `Desembolso: ${credito.desembolsadoEn ? this.fechaMx(credito.desembolsadoEn) : '—'}`,
        ML, doc.y,
      );
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK);
      doc.text(
        `Saldo pendiente: $${this.money(credito.resumen.saldoPendiente)}   ` +
        `Mora pendiente: $${this.money(credito.resumen.moraPendiente)}   ` +
        `Cuotas vencidas: ${credito.resumen.cuotasVencidas}   ` +
        `Pagadas: ${credito.resumen.cuotasPagadas}/${credito.resumen.totalCuotas}`,
        ML, doc.y,
      );
      doc.moveDown(0.5);

      // Tabla de cuotas
      const cols = [
        { label: '#', w: 30, align: 'center' as const },
        { label: 'Vence', w: 70, align: 'center' as const },
        { label: 'Cuota', w: 70, align: 'right' as const },
        { label: 'Saldo', w: 70, align: 'right' as const },
        { label: 'Estatus', w: 70, align: 'center' as const },
        { label: 'Atraso', w: 55, align: 'center' as const },
        { label: 'Mora pend.', w: 70, align: 'right' as const },
      ];
      const tW = cols.reduce((s, c) => s + c.w, 0);
      const rowH = 14;

      const drawHead = () => {
        let cx = ML;
        const headY = doc.y;              // Y fija: no leer doc.y dentro del forEach
        doc.rect(ML, headY, tW, 16).fill('#2d3748');
        cols.forEach((c) => {
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#fff')
            .text(c.label, cx + 3, headY + 5, { width: c.w - 6, align: c.align, lineBreak: false });
          cx += c.w;
        });
        doc.y = headY + 17;               // avanzar desde la Y fija, no la modificada
      };
      drawHead();

      for (const cu of credito.cuotas) {
        if (doc.y + rowH > doc.page.height - 55) {
          doc.addPage(); doc.y = 50; drawHead();
        }
        const rowY = doc.y;               // Y fija de esta fila
        // Fondo tenue si la cuota está vencida
        const vencida = !cu.pagada && cu.diasAtraso > 0;
        if (vencida) { doc.rect(ML, rowY, tW, rowH).fill('#FFF5F5'); }
        else if (cu.pagada) { doc.rect(ML, rowY, tW, rowH).fill('#F7FAFC'); }

        const estatusTxt = vencida ? 'VENCIDO' : cu.estatus;
        const cells = [
          String(cu.periodo),
          this.fechaMx(cu.vence),
          `$${this.money(cu.cuota)}`,
          `$${this.money(cu.saldo)}`,
          estatusTxt,
          cu.diasAtraso > 0 ? `${cu.diasAtraso} d` : '—',
          cu.moraPendiente > 0 ? `$${this.money(cu.moraPendiente)}` : '—',
        ];
        let cx = ML;
        cells.forEach((cell, i) => {
          let color = '#4A5568';
          if (i === 4 && vencida) color = '#DC2626';
          if (i === 6 && cu.moraPendiente > 0) color = '#DC2626';
          if (cu.pagada) color = '#A0AEC0';
          doc.font('Helvetica').fontSize(7).fillColor(color)
            .text(cell, cx + 3, rowY + 4, { width: cols[i].w - 6, align: cols[i].align, lineBreak: false });
          cx += cols[i].w;
        });
        doc.moveTo(ML, rowY + rowH).lineTo(ML + tW, rowY + rowH)
          .strokeColor('#E2E8F0').lineWidth(0.3).stroke();
        doc.y = rowY + rowH;              // avanzar desde la Y fija
      }
      doc.moveDown(1);
    }

    // Pie de página en TODAS las páginas ya generadas.
    // Se usa el buffer de páginas (bufferPages:true). Con save/restore y un
    // height explícito, PDFKit escribe el pie sin recalcular el flujo ni crear
    // una hoja nueva (que era lo que empujaba el pie a una página en blanco).
    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
      doc.switchToPage(i);
      doc.save();
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(GRAY)
        .text(
          'Documento informativo generado por el sistema. Los saldos y moras reflejan el estado a la fecha de generación.',
          ML, doc.page.height - 35,
          { width: CW, align: 'center', lineBreak: false, height: 12 },
        );
      doc.restore();
    }

    doc.end();
  }

  // ── Excel ──────────────────────────────────────────────────
  async generateExcel(customerId: string, res: Response, incluirLiquidados = true): Promise<void> {
    const data = await this.getClientHistory(customerId, incluirLiquidados);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Historial');

    // Cabecera del cliente
    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = `Historial del cliente: ${data.cliente.nombre}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.mergeCells('A2:H2');
    ws.getCell('A2').value =
      `CURP: ${data.cliente.curp || '—'}   Tel: ${data.cliente.telefono || '—'}   ` +
      `Generado: ${this.fechaMx(data.generadoEn)}`;
    ws.getCell('A2').font = { color: { argb: 'FF718096' } };
    ws.mergeCells('A3:H3');
    ws.getCell('A3').value =
      `Créditos: ${data.totales.creditos}   ` +
      `Saldo pendiente total: $${this.money(data.totales.saldoPendiente)}   ` +
      `Mora pendiente total: $${this.money(data.totales.moraPendiente)}`;
    ws.getCell('A3').font = { bold: true };

    let row = 5;
    for (const credito of data.creditos) {
      // Encabezado del crédito
      ws.mergeCells(`A${row}:H${row}`);
      const hc = ws.getCell(`A${row}`);
      hc.value = `Crédito ${credito.id.substring(0, 8).toUpperCase()} · ${credito.tipo} · ${credito.estatus}  ` +
        `| Monto $${this.money(credito.montoPrincipal)} · Cuota $${this.money(credito.cuotaPeriodica)} · ` +
        `Saldo $${this.money(credito.resumen.saldoPendiente)} · Mora $${this.money(credito.resumen.moraPendiente)}`;
      hc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2795F5' } };
      row++;

      // Encabezados de columna
      const headers = ['#', 'Vence', 'Cuota', 'Saldo', 'Estatus', 'Días atraso', 'Mora generada', 'Mora pendiente'];
      headers.forEach((h, i) => {
        const cell = ws.getCell(row, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      });
      row++;

      for (const cu of credito.cuotas) {
        const vencida = !cu.pagada && cu.diasAtraso > 0;
        const vals = [
          cu.periodo,
          this.fechaMx(cu.vence),
          Number(cu.cuota),
          Number(cu.saldo),
          vencida ? 'VENCIDO' : cu.estatus,
          cu.diasAtraso,
          Number(cu.moraGenerada),
          Number(cu.moraPendiente),
        ];
        vals.forEach((v, i) => {
          const cell = ws.getCell(row, i + 1);
          cell.value = v as any;
          if ([3, 4, 7, 8].includes(i + 1)) cell.numFmt = '"$"#,##0.00';
          if (vencida && (i === 4 || i === 7)) cell.font = { color: { argb: 'FFDC2626' } };
        });
        row++;
      }
      row++; // espacio entre créditos
    }

    ws.columns.forEach((col, i) => { col.width = i === 0 ? 8 : 15; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="historial-${data.cliente.nombre.replace(/\s+/g, '-').toLowerCase()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ClientHistoryController {
  constructor(private service: ClientHistoryService) {}

  // Datos JSON (por si se quiere previsualizar)
  @Get('client-history/:customerId')
  @AuthPermission('clientes.ver')
  history(
    @Param('customerId') customerId: string,
    @Query('incluirLiquidados') incluirLiquidados?: string,
  ) {
    return this.service.getClientHistory(customerId, incluirLiquidados !== 'false');
  }

  // PDF del historial
  @Get('client-history/:customerId/pdf')
  @AuthPermission('clientes.ver')
  pdf(
    @Param('customerId') customerId: string,
    @Res() res: Response,
    @Query('incluirLiquidados') incluirLiquidados?: string,
  ) {
    return this.service.generatePdf(customerId, res, incluirLiquidados !== 'false');
  }

  // Excel del historial
  @Get('client-history/:customerId/excel')
  @AuthPermission('clientes.ver')
  excel(
    @Param('customerId') customerId: string,
    @Res() res: Response,
    @Query('incluirLiquidados') incluirLiquidados?: string,
  ) {
    return this.service.generateExcel(customerId, res, incluirLiquidados !== 'false');
  }
}