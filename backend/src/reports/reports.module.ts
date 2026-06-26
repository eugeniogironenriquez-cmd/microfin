import { Module, Controller, Injectable, Get, Query, Res } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Loan, Payment, Customer } from '../common/entities';
import { Auth } from '../common/guards/roles.guard';
import { Response } from 'express';

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
}

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Payment, Customer])],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}