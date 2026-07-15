import { Injectable, Controller, Get, Query, Res } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Auth } from '../common/guards/roles.guard';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';

/**
 * Corte de caja por cobrador.
 *
 * Muestra, para un rango de fechas, agrupado por día y dentro de cada día por
 * cobrador: el desglose de lo cobrado (capital, interés, moratorio) y el total
 * que debe entregar en efectivo a la oficina.
 *
 * Reglas de negocio establecidas:
 *  - Se agrupa por la fecha REAL del cobro: creado_en (timestamp), NO fecha_pago
 *    (que es date-only). Se convierte a zona de México antes de extraer el día.
 *  - El total a entregar suma TODOS los pagos sin importar forma_pago, pero se
 *    reporta por separado cuánto fue en efectivo vs. no-efectivo, para que la
 *    oficina sepa cuánto físico esperar.
 */
@Injectable()
export class CollectorCashService {
  constructor(private dataSource: DataSource) {}

  async getDailyCashByCollector(filters: { start?: string; end?: string }) {
    // Rango por defecto: del primer día del mes actual a hoy.
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const start = filters.start || `${hoy.slice(0, 7)}-01`;
    const end = filters.end || hoy;

    // CONVERT_TZ pasa el timestamp UTC a hora de México antes de sacar el día,
    // así el corte cae en el día correcto aunque el cobro se registre de noche.
    const rows = await this.dataSource.query(`
      SELECT
        DATE(CONVERT_TZ(pg.creado_en, '+00:00', '-06:00')) AS dia,
        pg.cobrador_id,
        COALESCE(u.nombre, 'Sin asignar') AS cobrador,
        COUNT(*) AS num_pagos,
        COUNT(DISTINCT pg.prestamo_id) AS creditos,
        SUM(pg.capital_aplicado) AS capital,
        SUM(pg.interes_aplicado) AS interes,
        SUM(pg.moratorio_aplicado) AS moratorio,
        SUM(pg.monto_pagado) AS total,
        SUM(CASE WHEN pg.forma_pago = 'EFECTIVO' THEN pg.monto_pagado ELSE 0 END) AS efectivo,
        SUM(CASE WHEN pg.forma_pago <> 'EFECTIVO' THEN pg.monto_pagado ELSE 0 END) AS no_efectivo
      FROM pagos pg
      LEFT JOIN usuarios u ON u.id = pg.cobrador_id
      WHERE DATE(CONVERT_TZ(pg.creado_en, '+00:00', '-06:00')) >= ?
        AND DATE(CONVERT_TZ(pg.creado_en, '+00:00', '-06:00')) <= ?
      GROUP BY dia, pg.cobrador_id, cobrador
      ORDER BY dia ASC, total DESC
    `, [start, end]);

    // Agrupar en estructura por día para que el front la pinte directo.
    const dias: Record<string, any> = {};
    for (const r of rows) {
      const dia = r.dia instanceof Date
        ? r.dia.toISOString().slice(0, 10)
        : String(r.dia);
      if (!dias[dia]) {
        dias[dia] = {
          dia,
          cobradores: [],
          totalDia: 0, efectivoDia: 0, noEfectivoDia: 0,
          capitalDia: 0, interesDia: 0, moratorioDia: 0,
        };
      }
      const fila = {
        cobradorId: r.cobrador_id,
        cobrador: r.cobrador,
        numPagos: Number(r.num_pagos || 0),
        creditos: Number(r.creditos || 0),
        capital: Number(r.capital || 0),
        interes: Number(r.interes || 0),
        moratorio: Number(r.moratorio || 0),
        total: Number(r.total || 0),
        efectivo: Number(r.efectivo || 0),
        noEfectivo: Number(r.no_efectivo || 0),
      };
      dias[dia].cobradores.push(fila);
      dias[dia].totalDia += fila.total;
      dias[dia].efectivoDia += fila.efectivo;
      dias[dia].noEfectivoDia += fila.noEfectivo;
      dias[dia].capitalDia += fila.capital;
      dias[dia].interesDia += fila.interes;
      dias[dia].moratorioDia += fila.moratorio;
    }

    const listaDias = Object.values(dias);

    // Totales generales del periodo.
    const totales = listaDias.reduce((acc: any, d: any) => {
      acc.total += d.totalDia;
      acc.efectivo += d.efectivoDia;
      acc.noEfectivo += d.noEfectivoDia;
      acc.capital += d.capitalDia;
      acc.interes += d.interesDia;
      acc.moratorio += d.moratorioDia;
      return acc;
    }, { total: 0, efectivo: 0, noEfectivo: 0, capital: 0, interes: 0, moratorio: 0 });

    return { start, end, dias: listaDias, totales };
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class CollectorCashController {
  constructor(private service: CollectorCashService) {}

  // Datos JSON para la pantalla.
  @Get('collector-cash')
  @Auth()
  collectorCash(@Query() q: any) {
    return this.service.getDailyCashByCollector({ start: q.start, end: q.end });
  }

  // Excel del corte de caja por cobrador.
  @Get('export/collector-cash')
  @Auth()
  async exportCollectorCash(@Query() q: any, @Res() res: Response) {
    const { start, end, dias, totales } = await this.service.getDailyCashByCollector({
      start: q.start, end: q.end,
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Corte por cobrador');

    ws.columns = [
      { header: 'Día', key: 'dia', width: 14 },
      { header: 'Cobrador', key: 'cobrador', width: 28 },
      { header: 'Pagos', key: 'numPagos', width: 10 },
      { header: 'Créditos', key: 'creditos', width: 10 },
      { header: 'Capital', key: 'capital', width: 14 },
      { header: 'Interés', key: 'interes', width: 14 },
      { header: 'Moratorio', key: 'moratorio', width: 14 },
      { header: 'Efectivo', key: 'efectivo', width: 14 },
      { header: 'No efectivo', key: 'noEfectivo', width: 14 },
      { header: 'Total a entregar', key: 'total', width: 16 },
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2795F5' },
    };

    for (const d of dias) {
      // Filas de cada cobrador del día.
      for (const c of d.cobradores) {
        ws.addRow({
          dia: d.dia,
          cobrador: c.cobrador,
          numPagos: c.numPagos,
          creditos: c.creditos,
          capital: c.capital,
          interes: c.interes,
          moratorio: c.moratorio,
          efectivo: c.efectivo,
          noEfectivo: c.noEfectivo,
          total: c.total,
        });
      }
      // Subtotal del día.
      const sub = ws.addRow({
        dia: d.dia,
        cobrador: 'SUBTOTAL DÍA',
        capital: d.capitalDia,
        interes: d.interesDia,
        moratorio: d.moratorioDia,
        efectivo: d.efectivoDia,
        noEfectivo: d.noEfectivoDia,
        total: d.totalDia,
      });
      sub.font = { bold: true };
      sub.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      });
    }

    // Fila de totales generales.
    const totalRow = ws.addRow({
      cobrador: 'TOTAL PERIODO',
      capital: totales.capital,
      interes: totales.interes,
      moratorio: totales.moratorio,
      efectivo: totales.efectivo,
      noEfectivo: totales.noEfectivo,
      total: totales.total,
    });
    totalRow.font = { bold: true, size: 12 };
    totalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    });

    ['capital', 'interes', 'moratorio', 'efectivo', 'noEfectivo', 'total'].forEach((key) => {
      ws.getColumn(key).numFmt = '"$"#,##0.00';
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="corte-cobradores-${start}-a-${end}.xlsx"`,
    );
    await wb.xlsx.write(res);
    res.end();
  }
}