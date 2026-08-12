import {
  Module, Controller, Injectable, Get, Post, Delete,
  Body, Param, Query, NotFoundException, Res,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ExpenseCategory, Expense, Payment, CashSession, UserRole, PaymentMethod } from '../common/entities';
import { Auth, CurrentUser } from '../common/guards/roles.guard';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ExpenseCategoryService {
  constructor(@InjectRepository(ExpenseCategory) private repo: Repository<ExpenseCategory>) {}

  findAll(): Promise<ExpenseCategory[]> {
    return this.repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async create(dto: { name: string; description?: string }): Promise<ExpenseCategory> {
    return this.repo.save(this.repo.create(dto));
  }

  async remove(id: string): Promise<void> {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Categoría no encontrada');
    cat.isActive = false;
    await this.repo.save(cat);
  }
}

@Injectable()
export class ExpenseService {
  constructor(
    @InjectRepository(Expense) private expenseRepo: Repository<Expense>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(CashSession) private cashRepo: Repository<CashSession>,
    private dataSource: DataSource,
  ) {}

  async findAll(filters: { page?: number; limit?: number; startDate?: string; endDate?: string; categoryId?: string }) {
    const { page = 1, limit = 20 } = filters;
    const qb = this.expenseRepo.createQueryBuilder('g')
      .leftJoinAndSelect('g.category', 'cat')
      .orderBy('g.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit);
    if (filters.startDate) qb.andWhere('g.expenseDate >= :start', { start: filters.startDate });
    if (filters.endDate)   qb.andWhere('g.expenseDate <= :end',   { end: filters.endDate });
    if (filters.categoryId) qb.andWhere('g.categoryId = :cat', { cat: filters.categoryId });
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  // Exporta los gastos (con los mismos filtros de fecha/categoría) a un Excel.
  async exportExcel(
    filters: { startDate?: string; endDate?: string; categoryId?: string },
    res: Response,
  ): Promise<void> {
    const qb = this.expenseRepo.createQueryBuilder('g')
      .leftJoinAndSelect('g.category', 'cat')
      .orderBy('g.expenseDate', 'ASC');
    if (filters.startDate) qb.andWhere('g.expenseDate >= :start', { start: filters.startDate });
    if (filters.endDate)   qb.andWhere('g.expenseDate <= :end',   { end: filters.endDate });
    if (filters.categoryId) qb.andWhere('g.categoryId = :cat', { cat: filters.categoryId });
    const gastos = await qb.getMany();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Gastos');

    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Categoría', key: 'categoria', width: 24 },
      { header: 'Descripción', key: 'descripcion', width: 40 },
      { header: 'Método', key: 'metodo', width: 16 },
      { header: 'Monto', key: 'monto', width: 16 },
    ];

    // Encabezado con estilo (mismo azul del sistema).
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2795F5' },
    };

    let totalMonto = 0;
    for (const g of gastos) {
      const monto = Number((g as any).amount || 0);
      totalMonto += monto;
      ws.addRow({
        fecha: (g as any).expenseDate,
        categoria: (g as any).category?.name || '—',
        descripcion: (g as any).description || '',
        metodo: (g as any).method || '',
        monto,
      });
    }

    // Fila de total.
    const totalRow = ws.addRow({
      descripcion: 'TOTAL',
      monto: this.round2(totalMonto),
    });
    totalRow.font = { bold: true, size: 12 };
    totalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    });

    ws.getColumn('monto').numFmt = '"$"#,##0.00';

    const rango =
      filters.startDate || filters.endDate
        ? `${filters.startDate || 'inicio'}-a-${filters.endDate || 'hoy'}`
        : 'todos';

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="gastos-${rango}.xlsx"`,
    );
    await wb.xlsx.write(res);
    res.end();
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  async create(dto: {
    categoryId: string; amount: number; description: string;
    expenseDate: string; method?: PaymentMethod;
  }, userId: string): Promise<Expense> {
    const session = await this.cashRepo.findOne({ where: { cashierId: userId, closedAt: null as any } });
    const expense = this.expenseRepo.create({ ...dto, cashSessionId: session?.id, createdBy: userId });
    return this.expenseRepo.save(expense);
  }

  async remove(id: string): Promise<void> {
    await this.expenseRepo.delete(id);
  }

  async getIncomeExpenseReport(startDate: string, endDate: string) {
    const [ingresoResult] = await this.dataSource.query(`
      SELECT
        COALESCE(SUM(monto_pagado), 0)       AS total_ingresos,
        COALESCE(SUM(capital_aplicado), 0)   AS total_capital,
        COALESCE(SUM(interes_aplicado), 0)   AS total_intereses,
        COALESCE(SUM(moratorio_aplicado), 0) AS total_moratorios,
        COUNT(*)                              AS num_pagos
      FROM pagos WHERE fecha_pago BETWEEN ? AND ?
    `, [startDate, endDate]);

    const gastoResult = await this.dataSource.query(`
      SELECT c.nombre AS categoria, COALESCE(SUM(g.monto), 0) AS subtotal, COUNT(*) AS num_gastos
      FROM gastos g LEFT JOIN categorias_gasto c ON c.id = g.categoria_id
      WHERE g.fecha_gasto BETWEEN ? AND ?
      GROUP BY g.categoria_id, c.nombre ORDER BY subtotal DESC
    `, [startDate, endDate]);

    const totalGastos = gastoResult.reduce((s: number, r: any) => s + Number(r.subtotal), 0);
    return {
      periodo: { inicio: startDate, fin: endDate },
      ingresos: {
        total:      Number(ingresoResult?.total_ingresos || 0),
        capital:    Number(ingresoResult?.total_capital || 0),
        intereses:  Number(ingresoResult?.total_intereses || 0),
        moratorios: Number(ingresoResult?.total_moratorios || 0),
        numPagos:   Number(ingresoResult?.num_pagos || 0),
      },
      gastos: {
        total:    totalGastos,
        porCategoria: gastoResult.map((r: any) => ({ categoria: r.categoria, subtotal: Number(r.subtotal) })),
      },
      utilidad: Number(ingresoResult?.total_ingresos || 0) - totalGastos,
    };
  }
}

@ApiTags('expense-categories')
@ApiBearerAuth()
@Controller('expense-categories')
export class ExpenseCategoryController {
  constructor(private svc: ExpenseCategoryService) {}
  @Get()    @Auth() findAll() { return this.svc.findAll(); }
  @Post()   @Auth(UserRole.ADMIN) create(@Body() dto: any) { return this.svc.create(dto); }
  @Delete(':id') @Auth(UserRole.ADMIN) remove(@Param('id') id: string) { return this.svc.remove(id); }
}

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpenseController {
  constructor(private svc: ExpenseService) {}

  @Get() @Auth() findAll(@Query() q: any) { return this.svc.findAll(q); }

  // Exporta los gastos a Excel, respetando los filtros de fecha/categoría.
  @Get('export/excel') @Auth()
  exportExcel(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('categoryId') categoryId: string,
    @Res() res: Response,
  ) {
    return this.svc.exportExcel({ startDate, endDate, categoryId }, res);
  }

  @Post() @Auth(UserRole.ADMIN, UserRole.CAJERO)
  create(@Body() dto: any, @CurrentUser('id') userId: string) { return this.svc.create(dto, userId); }

  @Delete(':id') @Auth(UserRole.ADMIN)
  remove(@Param('id') id: string) { return this.svc.remove(id); }

  @Get('report/income-expense') @Auth()
  report(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.svc.getIncomeExpenseReport(startDate, endDate);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ExpenseCategory, Expense, Payment, CashSession])],
  providers: [ExpenseCategoryService, ExpenseService],
  controllers: [ExpenseCategoryController, ExpenseController],
  exports: [ExpenseService],
})
export class ExpensesModule {}