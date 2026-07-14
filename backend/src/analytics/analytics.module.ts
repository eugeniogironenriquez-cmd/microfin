import {
  Module, Controller, Injectable, Get, Query,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Loan, Payment, Customer, PaymentSchedule } from '../common/entities';
import { Auth } from '../common/guards/roles.guard';

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
}

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Payment, Customer, PaymentSchedule])],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}