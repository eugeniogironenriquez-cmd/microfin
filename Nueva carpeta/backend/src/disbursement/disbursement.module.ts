import {
  Module, Controller, Injectable, Get, Post,
  Body, Param, Query, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Loan, PaymentSchedule, LoanStatus, ScheduleStatus, UserRole } from '../common/entities';
import { Auth, CurrentUser } from '../common/guards/roles.guard';
import { LoansModule, FinancialCalculator } from '../loans/loans.module';

@Injectable()
export class DisbursementService {
  constructor(
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
    private calculator: FinancialCalculator,
    private dataSource: DataSource,
  ) {}

  async getPending(filters: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 20 } = filters;
    const qb = this.loanRepo.createQueryBuilder('l')
      .where('l.status = :status', { status: LoanStatus.AUTORIZADO })
      .leftJoinAndSelect('l.customer', 'c')
      .leftJoinAndSelect('l.loanType', 'lt')
      .addOrderBy('l.authorizedAt', 'ASC')
      .skip((page - 1) * limit).take(limit);

    if (filters.search) {
      qb.andWhere('(c.fullName LIKE :s OR c.phone LIKE :s)', { s: `%${filters.search}%` });
    }
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async disburse(loanId: string, dto: { disbursementMethod: string; notes?: string }, userId: string) {
    const loan = await this.loanRepo.findOne({
      where: { id: loanId, status: LoanStatus.AUTORIZADO },
      relations: ['loanType'],
    });
    if (!loan) throw new NotFoundException('Préstamo no encontrado o no está autorizado');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      loan.status = LoanStatus.ACTIVO;
      loan.disbursedBy = userId;
      loan.disbursedAt = new Date();
      loan.disbursementMethod = dto.disbursementMethod;
      if (dto.notes) loan.notes = dto.notes;
      await qr.manager.save(loan);

      // Nueva fórmula: el plazo en días es termWeeks, el % está en totalRate/interestRate
      const days       = Math.round(loan.termWeeks);
      const percentage = Number((loan as any).totalRate || loan.interestRate);

      // Calendario L-V empezando el día hábil siguiente al desembolso
      const table = this.calculator.generateScheduleTable(
        Number(loan.principalAmount), percentage, days, loan.disbursedAt,
      );

      const schedules = table.map((row) =>
        this.scheduleRepo.create({
          loanId: loan.id,
          periodNumber: row.period,
          dueDate: row.dueDate,
          principalDue: row.principal,
          interestDue: row.interest,
          totalDue: row.payment,
          balanceDue: row.payment,
          status: ScheduleStatus.PENDIENTE,
        }),
      );
      await qr.manager.save(schedules);
      await qr.commitTransaction();
      return { success: true, loan, schedulesGenerated: schedules.length };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getHistory(filters: { page?: number; limit?: number; startDate?: string; endDate?: string }) {
    const { page = 1, limit = 20 } = filters;
    const qb = this.loanRepo.createQueryBuilder('l')
      .where('l.status IN (:...statuses)', {
        statuses: [LoanStatus.ACTIVO, LoanStatus.VENCIDO, LoanStatus.LIQUIDADO, LoanStatus.REESTRUCTURADO],
      })
      .andWhere('l.disbursedAt IS NOT NULL')
      .leftJoinAndSelect('l.customer', 'c')
      .leftJoinAndSelect('l.loanType', 'lt')
      .addOrderBy('l.disbursedAt', 'DESC')
      .skip((page - 1) * limit).take(limit);

    if (filters.startDate) qb.andWhere('l.disbursedAt >= :start', { start: filters.startDate });
    if (filters.endDate)   qb.andWhere('l.disbursedAt <= :end', { end: filters.endDate });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}

@ApiTags('disbursements')
@ApiBearerAuth()
@Controller('disbursements')
export class DisbursementController {
  constructor(private disbursementService: DisbursementService) {}

  @Get('pending') @Auth(UserRole.ADMIN, UserRole.CAJERO)
  @ApiOperation({ summary: 'Préstamos autorizados pendientes de desembolso' })
  getPending(@Query() q: any) { return this.disbursementService.getPending(q); }

  @Get('history') @Auth()
  getHistory(@Query() q: any) { return this.disbursementService.getHistory(q); }

  @Post(':loanId') @Auth(UserRole.ADMIN, UserRole.CAJERO)
  @ApiOperation({ summary: 'Registrar desembolso' })
  disburse(@Param('loanId') loanId: string, @Body() dto: any, @CurrentUser('id') userId: string) {
    return this.disbursementService.disburse(loanId, dto, userId);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Loan, PaymentSchedule]),
    LoansModule,
  ],
  providers: [DisbursementService],
  controllers: [DisbursementController],
  exports: [DisbursementService],
})
export class DisbursementModule {}