import { Module, Controller, Injectable, Get, Query, Res } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Loan, Payment, Customer } from '../common/entities';
import { Auth } from '../common/guards/roles.guard';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ReportsService {
  constructor(private dataSource: DataSource) {}

  async getPortfolioSummary() {
    const [result] = await this.dataSource.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN estatus = 'ACTIVO' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN estatus = 'ATRASADO' THEN 1 ELSE 0 END) AS atrasados,
        SUM(CASE WHEN estatus = 'VENCIDO' THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN estatus = 'REESTRUCTURADO' THEN 1 ELSE 0 END) AS restructured,
        SUM(CASE WHEN estatus = 'LIQUIDADO' THEN 1 ELSE 0 END) AS settled,
        SUM(CASE WHEN estatus IN ('ACTIVO','ATRASADO') THEN monto_principal ELSE 0 END) AS totalActiveAmount
      FROM prestamos
    `);
    return result || {};
  }

  async getLoansReport(filters: {
    startDate?: string; endDate?: string;
    status?: string; stateId?: string; municipalityId?: string;
    page?: number; limit?: number;
  }) {
    const { page = 1, limit = 50 } = filters;
    let where = '1=1';
    const params: any[] = [];

    if (filters.startDate) { where += ' AND p.creado_en >= ?'; params.push(filters.startDate); }
    if (filters.endDate)   { where += ' AND p.creado_en <= ?'; params.push(filters.endDate); }
    if (filters.status)    { where += ' AND p.estatus = ?';    params.push(filters.status); }
    if (filters.stateId)   { where += ' AND c.estado_id = ?';  params.push(filters.stateId); }
    if (filters.municipalityId) { where += ' AND c.municipio_id = ?'; params.push(filters.municipalityId); }

    const data = await this.dataSource.query(`
      SELECT p.id, p.estatus, p.monto_principal, p.pago_periodico, p.frecuencia,
             p.desembolsado_en, p.creado_en,
             c.nombre_completo, c.telefono, c.estado_id, c.municipio_id,
             t.nombre AS tipo_prestamo,
             e.nombre AS estado_nombre, m.nombre AS municipio_nombre
      FROM prestamos p
      LEFT JOIN clientes c ON c.id = p.cliente_id
      LEFT JOIN tipos_prestamo t ON t.id = p.tipo_prestamo_id
      LEFT JOIN estados e ON e.id = c.estado_id
      LEFT JOIN municipios m ON m.id = c.municipio_id
      WHERE ${where}
      ORDER BY p.creado_en DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `, params);

    const [countResult] = await this.dataSource.query(`
      SELECT COUNT(*) AS total FROM prestamos p
      LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE ${where}
    `, params);

    return { data, total: Number(countResult?.total || 0), page, limit };
  }

  // Flujo de caja: detalle de cada pago en un rango de fechas.
  async getCashFlow(filters: { start?: string; end?: string }) {
    const start = filters.start || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().split('T')[0];
    const end = filters.end || new Date().toISOString().split('T')[0];

    // Un renglón por pago, con datos del cliente y del préstamo.
    const rows = await this.dataSource.query(`
      SELECT p.id,
             p.fecha_pago AS fecha,
             p.prestamo_id,
             p.monto_pagado,
             p.moratorio_aplicado,
             p.numero_comprobante,
             p.cuotas_pagadas,
             c.nombre_completo AS cliente
      FROM pagos p
      LEFT JOIN prestamos pr ON pr.id = p.prestamo_id
      LEFT JOIN clientes c ON c.id = pr.cliente_id
      WHERE DATE(p.fecha_pago) >= ? AND DATE(p.fecha_pago) <= ?
      ORDER BY p.fecha_pago ASC, c.nombre_completo ASC
    `, [start, end]);

    // Extraer el/los número(s) de cuota del JSON cuotas_pagadas.
    return rows.map((r: any) => {
      let numCuota = '';
      if (r.cuotas_pagadas) {
        try {
          const arr = JSON.parse(r.cuotas_pagadas);
          if (Array.isArray(arr)) {
            numCuota = arr
              .map((x: any) => (typeof x === 'object' ? (x.periodo ?? x.period ?? x) : x))
              .join(', ');
          }
        } catch {
          // Si no es JSON válido, se deja vacío.
        }
      }
      return {
        id: r.id,
        fecha: r.fecha,
        prestamoId: r.prestamo_id,
        cliente: r.cliente || '',
        montoPagado: Number(r.monto_pagado || 0),
        moratorio: Number(r.moratorio_aplicado || 0),
        folio: r.numero_comprobante || '',
        numCuota,
      };
    });
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('portfolio')
  @Auth()
  portfolioSummary() { return this.reportsService.getPortfolioSummary(); }

  @Get('loans')
  @Auth()
  loansReport(@Query() q: any) { return this.reportsService.getLoansReport(q); }

  @Get('export/location')
  @Auth()
  async exportLocation(@Query() q: any, @Res() res: Response) {
    const data = await this.reportsService.getLoansReport({ ...q, limit: 10000 });
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  }

  // Excel de cartera vigente: todos los créditos activos con sus datos.
  @Get('export/portfolio')
  @Auth()
  async exportPortfolio(@Query() q: any, @Res() res: Response) {
    const result = await this.reportsService.getLoansReport({ ...q, limit: 100000 });
    const rows = result.data || [];

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cartera Vigente');

    ws.columns = [
      { header: 'Folio', key: 'id', width: 38 },
      { header: 'Cliente', key: 'nombre_completo', width: 32 },
      { header: 'Teléfono', key: 'telefono', width: 15 },
      { header: 'Tipo', key: 'tipo_prestamo', width: 18 },
      { header: 'Estatus', key: 'estatus', width: 14 },
      { header: 'Monto', key: 'monto_principal', width: 14 },
      { header: 'Pago', key: 'pago_periodico', width: 12 },
      { header: 'Frecuencia', key: 'frecuencia', width: 12 },
      { header: 'Estado', key: 'estado_nombre', width: 18 },
      { header: 'Municipio', key: 'municipio_nombre', width: 18 },
      { header: 'Desembolso', key: 'desembolsado_en', width: 16 },
    ];

    // Encabezado con estilo.
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2795F5' },
    };

    for (const r of rows) {
      ws.addRow({
        ...r,
        monto_principal: Number(r.monto_principal || 0),
        pago_periodico: Number(r.pago_periodico || 0),
        desembolsado_en: r.desembolsado_en
          ? new Date(r.desembolsado_en).toLocaleDateString('es-MX')
          : '',
      });
    }

    // Formato de moneda en columnas de importe.
    ['monto_principal', 'pago_periodico'].forEach((key) => {
      ws.getColumn(key).numFmt = '"$"#,##0.00';
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="cartera-vigente.xlsx"',
    );
    await wb.xlsx.write(res);
    res.end();
  }

  // Datos de flujo de caja (JSON, para mostrar en pantalla).
  @Get('cash-flow')
  @Auth()
  cashFlow(@Query() q: any) {
    return this.reportsService.getCashFlow({ start: q.start, end: q.end });
  }

  // Excel de flujo de caja: detalle de cada pago.
  @Get('export/cash-flow')
  @Auth()
  async exportCashFlow(@Query() q: any, @Res() res: Response) {
    const rows = await this.reportsService.getCashFlow({ start: q.start, end: q.end });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Flujo de Caja');

    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Cliente', key: 'cliente', width: 32 },
      { header: 'Préstamo', key: 'prestamoId', width: 38 },
      { header: 'Cuota #', key: 'numCuota', width: 10 },
      { header: 'Monto', key: 'montoPagado', width: 14 },
      { header: 'Moratorio', key: 'moratorio', width: 14 },
      { header: 'Folio', key: 'folio', width: 20 },
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2795F5' },
    };

    let totalMonto = 0;
    let totalMoratorio = 0;
    for (const r of rows) {
      totalMonto += Number(r.montoPagado || 0);
      totalMoratorio += Number(r.moratorio || 0);
      ws.addRow({
        fecha: r.fecha ? new Date(r.fecha).toLocaleDateString('es-MX') : '',
        cliente: r.cliente,
        prestamoId: r.prestamoId,
        numCuota: r.numCuota,
        montoPagado: Number(r.montoPagado || 0),
        moratorio: Number(r.moratorio || 0),
        folio: r.folio,
      });
    }

    // Fila de totales.
    const totalRow = ws.addRow({
      cliente: 'TOTAL',
      montoPagado: totalMonto,
      moratorio: totalMoratorio,
    });
    totalRow.font = { bold: true };

    ['montoPagado', 'moratorio'].forEach((key) => {
      ws.getColumn(key).numFmt = '"$"#,##0.00';
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="flujo-de-caja.xlsx"',
    );
    await wb.xlsx.write(res);
    res.end();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Payment, Customer])],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}