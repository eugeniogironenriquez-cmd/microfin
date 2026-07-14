import {
  Module, Controller, Injectable, Get, Post, Query, Body, Res,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Loan, Payment, Customer, PaymentSchedule } from '../common/entities';
import { Auth } from '../common/guards/roles.guard';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';

/**
 * Analítica de cartera: métricas y series para el dashboard con gráficas.
 *
 * Todas las consultas aceptan un rango de fechas (start / end, formato
 * YYYY-MM-DD). Si no se envía, se usan los últimos 12 meses.
 */
@Injectable()
export class AnalyticsService {
  constructor(private dataSource: DataSource) {}

  /** Rango por defecto: últimos 12 meses hasta hoy. */
  private resolveRange(start?: string, end?: string) {
    const hoy = new Date();
    const endDate = end || hoy.toISOString().split('T')[0];
    const doceMeses = new Date(hoy);
    doceMeses.setMonth(doceMeses.getMonth() - 11);
    doceMeses.setDate(1);
    const startDate = start || doceMeses.toISOString().split('T')[0];
    return { startDate, endDate };
  }

  // ── 1. SOLICITUDES POR MES ──────────────────────────────────
  // Cuántos créditos se solicitaron cada mes (por fecha de creación).
  async solicitudesPorMes(start?: string, end?: string) {
    const { startDate, endDate } = this.resolveRange(start, end);
    return this.dataSource.query(`
      SELECT DATE_FORMAT(l.creado_en, '%Y-%m') AS mes,
             COUNT(*) AS total,
             SUM(CASE WHEN l.estatus = 'RECHAZADO' THEN 1 ELSE 0 END) AS rechazadas,
             SUM(CASE WHEN l.estatus NOT IN ('SOLICITUD','RECHAZADO') THEN 1 ELSE 0 END) AS aprobadas
      FROM prestamos l
      WHERE DATE(l.creado_en) BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(l.creado_en, '%Y-%m')
      ORDER BY mes ASC
    `, [startDate, endDate]);
  }

  // ── 2. ATRASOS POR MES ──────────────────────────────────────
  // Cuántas cuotas vencieron sin pagarse en cada mes.
  async atrasosPorMes(start?: string, end?: string) {
    const { startDate, endDate } = this.resolveRange(start, end);
    return this.dataSource.query(`
      SELECT DATE_FORMAT(cp.fecha_vencimiento, '%Y-%m') AS mes,
             COUNT(*) AS cuotas_vencidas,
             COUNT(DISTINCT cp.prestamo_id) AS creditos_afectados,
             COALESCE(SUM(cp.saldo_adeudado), 0) AS monto_atrasado
      FROM calendario_pagos cp
      WHERE cp.fecha_vencimiento < CURDATE()
        AND cp.estatus <> 'PAGADO'
        AND DATE(cp.fecha_vencimiento) BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(cp.fecha_vencimiento, '%Y-%m')
      ORDER BY mes ASC
    `, [startDate, endDate]);
  }

  // ── 3. COLOCACIÓN POR MES ($ desembolsado) ──────────────────
  async colocacionPorMes(start?: string, end?: string) {
    const { startDate, endDate } = this.resolveRange(start, end);
    return this.dataSource.query(`
      SELECT DATE_FORMAT(l.desembolsado_en, '%Y-%m') AS mes,
             COUNT(*) AS num_creditos,
             COALESCE(SUM(l.monto_principal), 0) AS monto_colocado
      FROM prestamos l
      WHERE l.desembolsado_en IS NOT NULL
        AND DATE(l.desembolsado_en) BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(l.desembolsado_en, '%Y-%m')
      ORDER BY mes ASC
    `, [startDate, endDate]);
  }

  // ── 4. RECUPERACIÓN POR MES ($ cobrado) ─────────────────────
  async recuperacionPorMes(start?: string, end?: string) {
    const { startDate, endDate } = this.resolveRange(start, end);
    return this.dataSource.query(`
      SELECT DATE_FORMAT(p.fecha_pago, '%Y-%m') AS mes,
             COUNT(*) AS num_pagos,
             COALESCE(SUM(p.monto_pagado), 0) AS total_cobrado,
             COALESCE(SUM(p.capital_aplicado), 0) AS capital,
             COALESCE(SUM(p.interes_aplicado), 0) AS interes,
             COALESCE(SUM(p.moratorio_aplicado), 0) AS moratorio
      FROM pagos p
      WHERE DATE(p.fecha_pago) BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(p.fecha_pago, '%Y-%m')
      ORDER BY mes ASC
    `, [startDate, endDate]);
  }

  // ── 5. ESTADO DE LA CARTERA (dona) ──────────────────────────
  async estadoCartera() {
    const rows = await this.dataSource.query(`
      SELECT l.estatus AS estado,
             COUNT(*) AS total,
             COALESCE(SUM(l.monto_principal), 0) AS monto
      FROM prestamos l
      GROUP BY l.estatus
      ORDER BY total DESC
    `);
    return rows;
  }

  // ── 6. TASA DE MOROSIDAD ────────────────────────────────────
  // % de la cartera activa que está en mora (atrasada o vencida).
  async tasaMorosidad() {
    const [row] = await this.dataSource.query(`
      SELECT
        COUNT(*) AS total_activos,
        SUM(CASE WHEN l.estatus IN ('ATRASADO','VENCIDO') THEN 1 ELSE 0 END) AS en_mora,
        COALESCE(SUM(l.monto_principal), 0) AS cartera_total,
        COALESCE(SUM(CASE WHEN l.estatus IN ('ATRASADO','VENCIDO')
                     THEN l.monto_principal ELSE 0 END), 0) AS cartera_en_mora
      FROM prestamos l
      WHERE l.estatus IN ('ACTIVO','ATRASADO','VENCIDO')
    `);

    const totalActivos = Number(row?.total_activos || 0);
    const enMora = Number(row?.en_mora || 0);
    const carteraTotal = Number(row?.cartera_total || 0);
    const carteraEnMora = Number(row?.cartera_en_mora || 0);

    return {
      totalActivos,
      enMora,
      carteraTotal: Math.round(carteraTotal * 100) / 100,
      carteraEnMora: Math.round(carteraEnMora * 100) / 100,
      // Tasa por número de créditos
      tasaCreditos: totalActivos > 0
        ? Math.round((enMora / totalActivos) * 10000) / 100
        : 0,
      // Tasa por monto (la que más se usa en el sector)
      tasaMonto: carteraTotal > 0
        ? Math.round((carteraEnMora / carteraTotal) * 10000) / 100
        : 0,
    };
  }

  // ── 7. CRÉDITOS POR TIPO DE PRODUCTO ────────────────────────
  async creditosPorTipo(start?: string, end?: string) {
    const { startDate, endDate } = this.resolveRange(start, end);
    return this.dataSource.query(`
      SELECT COALESCE(tp.nombre, 'Sin tipo') AS tipo,
             COUNT(*) AS total,
             COALESCE(SUM(l.monto_principal), 0) AS monto
      FROM prestamos l
      LEFT JOIN tipos_prestamo tp ON tp.id = l.tipo_prestamo_id
      WHERE DATE(l.creado_en) BETWEEN ? AND ?
      GROUP BY tp.nombre
      ORDER BY total DESC
    `, [startDate, endDate]);
  }

  // ── 8. DESEMPEÑO POR COBRADOR ───────────────────────────────
  async desempenoPorCobrador(start?: string, end?: string) {
    const { startDate, endDate } = this.resolveRange(start, end);
    return this.dataSource.query(`
      SELECT u.nombre AS cobrador,
             COUNT(DISTINCT p.id) AS num_pagos,
             COALESCE(SUM(p.monto_pagado), 0) AS total_cobrado,
             COUNT(DISTINCT p.prestamo_id) AS creditos_atendidos
      FROM pagos p
      INNER JOIN usuarios u ON u.id = p.cobrador_id
      WHERE p.cobrador_id IS NOT NULL
        AND DATE(p.fecha_pago) BETWEEN ? AND ?
      GROUP BY u.id, u.nombre
      ORDER BY total_cobrado DESC
    `, [startDate, endDate]);
  }

  // ── RESUMEN COMPLETO (una sola llamada) ─────────────────────
  async dashboard(start?: string, end?: string) {
    const [
      solicitudes, atrasos, colocacion, recuperacion,
      estado, morosidad, porTipo, cobradores,
    ] = await Promise.all([
      this.solicitudesPorMes(start, end),
      this.atrasosPorMes(start, end),
      this.colocacionPorMes(start, end),
      this.recuperacionPorMes(start, end),
      this.estadoCartera(),
      this.tasaMorosidad(),
      this.creditosPorTipo(start, end),
      this.desempenoPorCobrador(start, end),
    ]);

    return {
      solicitudesPorMes: solicitudes,
      atrasosPorMes: atrasos,
      colocacionPorMes: colocacion,
      recuperacionPorMes: recuperacion,
      estadoCartera: estado,
      morosidad,
      creditosPorTipo: porTipo,
      desempenoCobradores: cobradores,
      rango: this.resolveRange(start, end),
    };
  }
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  /** Todo el dashboard en una sola llamada. */
  @Get('dashboard')
  @Auth()
  dashboard(@Query('start') start?: string, @Query('end') end?: string) {
    return this.analytics.dashboard(start, end);
  }

  // Endpoints individuales (por si se quiere refrescar solo una gráfica)
  @Get('solicitudes')  @Auth()
  solicitudes(@Query('start') s?: string, @Query('end') e?: string) {
    return this.analytics.solicitudesPorMes(s, e);
  }

  @Get('atrasos')      @Auth()
  atrasos(@Query('start') s?: string, @Query('end') e?: string) {
    return this.analytics.atrasosPorMes(s, e);
  }

  @Get('colocacion')   @Auth()
  colocacion(@Query('start') s?: string, @Query('end') e?: string) {
    return this.analytics.colocacionPorMes(s, e);
  }

  @Get('recuperacion') @Auth()
  recuperacion(@Query('start') s?: string, @Query('end') e?: string) {
    return this.analytics.recuperacionPorMes(s, e);
  }

  @Get('estado-cartera') @Auth()
  estadoCartera() {
    return this.analytics.estadoCartera();
  }

  @Get('morosidad')    @Auth()
  morosidad() {
    return this.analytics.tasaMorosidad();
  }

  @Get('por-tipo')     @Auth()
  porTipo(@Query('start') s?: string, @Query('end') e?: string) {
    return this.analytics.creditosPorTipo(s, e);
  }

  @Get('cobradores')   @Auth()
  cobradores(@Query('start') s?: string, @Query('end') e?: string) {
    return this.analytics.desempenoPorCobrador(s, e);
  }

  // ══════════════════════════════════════════════════════════
  // EXPORTACIÓN A EXCEL
  // ══════════════════════════════════════════════════════════

  /**
   * Excel COMPLETO: una hoja por bloque de datos, más las gráficas como
   * imágenes (que envía el frontend, ya que Chart.js dibuja en el navegador).
   *
   * Es POST porque las imágenes (base64) pueden ser grandes para un GET.
   */
  @Post('export/dashboard')
  @Auth()
  async exportDashboard(
    @Body() body: { start?: string; end?: string; imagenes?: Record<string, string> },
    @Res() res: Response,
  ) {
    const d = await this.analytics.dashboard(body.start, body.end);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Microcapital-Ixtepec';
    wb.created = new Date();

    const AZUL = 'FF2795F5';

    // Helper: crea una hoja con encabezado con estilo.
    const nuevaHoja = (nombre: string, columnas: Partial<ExcelJS.Column>[]) => {
      const ws = wb.addWorksheet(nombre);
      ws.columns = columnas as ExcelJS.Column[];
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL },
      };
      return ws;
    };

    // ── Hoja 1: Resumen (KPIs) ──
    const wsRes = wb.addWorksheet('Resumen');
    wsRes.columns = [
      { header: 'Indicador', key: 'k', width: 32 },
      { header: 'Valor', key: 'v', width: 24 },
    ] as ExcelJS.Column[];
    wsRes.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsRes.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };

    const m = d.morosidad;
    wsRes.addRow({ k: 'Periodo', v: `${d.rango.startDate} a ${d.rango.endDate}` });
    wsRes.addRow({ k: 'Cartera total', v: m.carteraTotal });
    wsRes.addRow({ k: 'Cartera en mora', v: m.carteraEnMora });
    wsRes.addRow({ k: 'Créditos activos', v: m.totalActivos });
    wsRes.addRow({ k: 'Créditos en mora', v: m.enMora });
    wsRes.addRow({ k: 'Tasa de morosidad (monto)', v: `${m.tasaMonto}%` });
    wsRes.addRow({ k: 'Tasa de morosidad (créditos)', v: `${m.tasaCreditos}%` });
    wsRes.getColumn('v').numFmt = '#,##0.00';

    // ── Hoja 2: Solicitudes por mes ──
    const wsSol = nuevaHoja('Solicitudes', [
      { header: 'Mes', key: 'mes', width: 12 },
      { header: 'Total', key: 'total', width: 10 },
      { header: 'Aprobadas', key: 'aprobadas', width: 12 },
      { header: 'Rechazadas', key: 'rechazadas', width: 12 },
    ]);
    for (const r of d.solicitudesPorMes) {
      wsSol.addRow({
        mes: r.mes, total: Number(r.total || 0),
        aprobadas: Number(r.aprobadas || 0), rechazadas: Number(r.rechazadas || 0),
      });
    }

    // ── Hoja 3: Atrasos por mes ──
    const wsAtr = nuevaHoja('Atrasos', [
      { header: 'Mes', key: 'mes', width: 12 },
      { header: 'Cuotas vencidas', key: 'cuotas', width: 16 },
      { header: 'Créditos afectados', key: 'creditos', width: 18 },
      { header: 'Monto atrasado', key: 'monto', width: 16 },
    ]);
    for (const r of d.atrasosPorMes) {
      wsAtr.addRow({
        mes: r.mes,
        cuotas: Number(r.cuotas_vencidas || 0),
        creditos: Number(r.creditos_afectados || 0),
        monto: Number(r.monto_atrasado || 0),
      });
    }
    wsAtr.getColumn('monto').numFmt = '"$"#,##0.00';

    // ── Hoja 4: Colocación por mes ──
    const wsCol = nuevaHoja('Colocación', [
      { header: 'Mes', key: 'mes', width: 12 },
      { header: 'Créditos', key: 'num', width: 12 },
      { header: 'Monto colocado', key: 'monto', width: 18 },
    ]);
    for (const r of d.colocacionPorMes) {
      wsCol.addRow({
        mes: r.mes,
        num: Number(r.num_creditos || 0),
        monto: Number(r.monto_colocado || 0),
      });
    }
    wsCol.getColumn('monto').numFmt = '"$"#,##0.00';

    // ── Hoja 5: Recuperación por mes ──
    const wsRec = nuevaHoja('Recuperación', [
      { header: 'Mes', key: 'mes', width: 12 },
      { header: 'Pagos', key: 'pagos', width: 10 },
      { header: 'Total cobrado', key: 'total', width: 16 },
      { header: 'Capital', key: 'capital', width: 14 },
      { header: 'Interés', key: 'interes', width: 14 },
      { header: 'Moratorio', key: 'moratorio', width: 14 },
    ]);
    for (const r of d.recuperacionPorMes) {
      wsRec.addRow({
        mes: r.mes,
        pagos: Number(r.num_pagos || 0),
        total: Number(r.total_cobrado || 0),
        capital: Number(r.capital || 0),
        interes: Number(r.interes || 0),
        moratorio: Number(r.moratorio || 0),
      });
    }
    ['total', 'capital', 'interes', 'moratorio'].forEach((k) => {
      wsRec.getColumn(k).numFmt = '"$"#,##0.00';
    });

    // ── Hoja 6: Estado de cartera ──
    const wsEst = nuevaHoja('Estado cartera', [
      { header: 'Estado', key: 'estado', width: 20 },
      { header: 'Créditos', key: 'total', width: 12 },
      { header: 'Monto', key: 'monto', width: 18 },
    ]);
    for (const r of d.estadoCartera) {
      wsEst.addRow({
        estado: r.estado,
        total: Number(r.total || 0),
        monto: Number(r.monto || 0),
      });
    }
    wsEst.getColumn('monto').numFmt = '"$"#,##0.00';

    // ── Hoja 7: Créditos por tipo ──
    const wsTipo = nuevaHoja('Por tipo', [
      { header: 'Tipo', key: 'tipo', width: 24 },
      { header: 'Créditos', key: 'total', width: 12 },
      { header: 'Monto', key: 'monto', width: 18 },
    ]);
    for (const r of d.creditosPorTipo) {
      wsTipo.addRow({
        tipo: r.tipo,
        total: Number(r.total || 0),
        monto: Number(r.monto || 0),
      });
    }
    wsTipo.getColumn('monto').numFmt = '"$"#,##0.00';

    // ── Hoja 8: Desempeño cobradores ──
    const wsCob = nuevaHoja('Cobradores', [
      { header: 'Cobrador', key: 'cobrador', width: 28 },
      { header: 'Pagos', key: 'pagos', width: 10 },
      { header: 'Créditos atendidos', key: 'creditos', width: 18 },
      { header: 'Total cobrado', key: 'total', width: 18 },
    ]);
    for (const r of d.desempenoCobradores) {
      wsCob.addRow({
        cobrador: r.cobrador,
        pagos: Number(r.num_pagos || 0),
        creditos: Number(r.creditos_atendidos || 0),
        total: Number(r.total_cobrado || 0),
      });
    }
    wsCob.getColumn('total').numFmt = '"$"#,##0.00';

    // ── Hoja 9: Gráficas (imágenes que envía el frontend) ──
    const imgs = body.imagenes || {};
    const nombres: Record<string, string> = {
      solicitudes: 'Solicitudes por mes',
      atrasos: 'Atrasos por mes',
      colocacion: 'Colocación por mes',
      recuperacion: 'Recuperación por mes',
      estado: 'Estado de la cartera',
      tipo: 'Créditos por tipo',
    };

    if (Object.keys(imgs).length > 0) {
      const wsImg = wb.addWorksheet('Gráficas');
      let fila = 1;
      for (const [clave, dataUrl] of Object.entries(imgs)) {
        if (!dataUrl) continue;
        try {
          // Título de la gráfica
          const celda = wsImg.getCell(`A${fila}`);
          celda.value = nombres[clave] || clave;
          celda.font = { bold: true, size: 12, color: { argb: 'FF2D3748' } };
          fila += 1;

          // Insertar la imagen (viene como data:image/png;base64,...)
          const base64 = dataUrl.split(',')[1];
          const imageId = wb.addImage({
            base64,
            extension: 'png',
          });
          wsImg.addImage(imageId, {
            tl: { col: 0, row: fila },
            ext: { width: 600, height: 300 },
          });
          fila += 17;   // dejar espacio para la imagen
        } catch {
          // Si una imagen falla, se omite y sigue con las demás.
        }
      }
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="analitica-cartera-${d.rango.startDate}-a-${d.rango.endDate}.xlsx"`,
    );
    await wb.xlsx.write(res);
    res.end();
  }

  /**
   * Excel de UNA sola gráfica/tabla. `tipo` indica cuál:
   * solicitudes | atrasos | colocacion | recuperacion | estado | por-tipo | cobradores
   */
  @Post('export/:tipo')
  @Auth()
  async exportUno(
    @Body() body: { tipo: string; start?: string; end?: string; imagen?: string },
    @Res() res: Response,
  ) {
    const tipo = body.tipo;
    const wb = new ExcelJS.Workbook();
    const AZUL = 'FF2795F5';

    let rows: any[] = [];
    let columnas: Partial<ExcelJS.Column>[] = [];
    let titulo = 'Datos';
    let money: string[] = [];

    switch (tipo) {
      case 'solicitudes':
        rows = await this.analytics.solicitudesPorMes(body.start, body.end);
        titulo = 'Solicitudes por mes';
        columnas = [
          { header: 'Mes', key: 'mes', width: 12 },
          { header: 'Total', key: 'total', width: 10 },
          { header: 'Aprobadas', key: 'aprobadas', width: 12 },
          { header: 'Rechazadas', key: 'rechazadas', width: 12 },
        ];
        break;

      case 'atrasos':
        rows = await this.analytics.atrasosPorMes(body.start, body.end);
        titulo = 'Atrasos por mes';
        columnas = [
          { header: 'Mes', key: 'mes', width: 12 },
          { header: 'Cuotas vencidas', key: 'cuotas_vencidas', width: 16 },
          { header: 'Créditos afectados', key: 'creditos_afectados', width: 18 },
          { header: 'Monto atrasado', key: 'monto_atrasado', width: 16 },
        ];
        money = ['monto_atrasado'];
        break;

      case 'colocacion':
        rows = await this.analytics.colocacionPorMes(body.start, body.end);
        titulo = 'Colocación por mes';
        columnas = [
          { header: 'Mes', key: 'mes', width: 12 },
          { header: 'Créditos', key: 'num_creditos', width: 12 },
          { header: 'Monto colocado', key: 'monto_colocado', width: 18 },
        ];
        money = ['monto_colocado'];
        break;

      case 'recuperacion':
        rows = await this.analytics.recuperacionPorMes(body.start, body.end);
        titulo = 'Recuperación por mes';
        columnas = [
          { header: 'Mes', key: 'mes', width: 12 },
          { header: 'Pagos', key: 'num_pagos', width: 10 },
          { header: 'Total cobrado', key: 'total_cobrado', width: 16 },
          { header: 'Capital', key: 'capital', width: 14 },
          { header: 'Interés', key: 'interes', width: 14 },
          { header: 'Moratorio', key: 'moratorio', width: 14 },
        ];
        money = ['total_cobrado', 'capital', 'interes', 'moratorio'];
        break;

      case 'estado':
        rows = await this.analytics.estadoCartera();
        titulo = 'Estado de la cartera';
        columnas = [
          { header: 'Estado', key: 'estado', width: 20 },
          { header: 'Créditos', key: 'total', width: 12 },
          { header: 'Monto', key: 'monto', width: 18 },
        ];
        money = ['monto'];
        break;

      case 'por-tipo':
        rows = await this.analytics.creditosPorTipo(body.start, body.end);
        titulo = 'Créditos por tipo';
        columnas = [
          { header: 'Tipo', key: 'tipo', width: 24 },
          { header: 'Créditos', key: 'total', width: 12 },
          { header: 'Monto', key: 'monto', width: 18 },
        ];
        money = ['monto'];
        break;

      case 'cobradores':
        rows = await this.analytics.desempenoPorCobrador(body.start, body.end);
        titulo = 'Desempeño por cobrador';
        columnas = [
          { header: 'Cobrador', key: 'cobrador', width: 28 },
          { header: 'Pagos', key: 'num_pagos', width: 10 },
          { header: 'Créditos atendidos', key: 'creditos_atendidos', width: 18 },
          { header: 'Total cobrado', key: 'total_cobrado', width: 18 },
        ];
        money = ['total_cobrado'];
        break;

      default:
        rows = [];
    }

    const ws = wb.addWorksheet(titulo.substring(0, 31));
    ws.columns = columnas as ExcelJS.Column[];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };

    for (const r of rows) {
      const fila: any = {};
      for (const c of columnas) {
        const k = c.key as string;
        const val = r[k];
        fila[k] = isNaN(Number(val)) ? val : Number(val);
      }
      ws.addRow(fila);
    }
    money.forEach((k) => { ws.getColumn(k).numFmt = '"$"#,##0.00'; });

    // Insertar la gráfica como imagen (si el frontend la envió).
    if (body.imagen) {
      try {
        const base64 = body.imagen.split(',')[1];
        const imageId = wb.addImage({ base64, extension: 'png' });
        const filaImg = rows.length + 3;
        ws.addImage(imageId, {
          tl: { col: 0, row: filaImg },
          ext: { width: 600, height: 300 },
        });
      } catch {
        // Si la imagen falla, el Excel sale solo con los datos.
      }
    }

    const slug = titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Payment, Customer, PaymentSchedule])],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}