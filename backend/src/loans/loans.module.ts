import 'dotenv/config';
import {
  Module, Controller, Injectable, Get, Post, Put, Patch,
  Body, Param, Query, Res, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { addDays } from 'date-fns';
import { Response } from 'express';
import {
  Loan, LoanType, PaymentSchedule, Customer,
  LoanStatus, ScheduleStatus, UserRole,
} from '../common/entities';
import { Auth, CurrentUser } from '../common/guards/roles.guard';
import { PdfGeneratorService } from '../pdf-generator/pdf-generator.service';
import { PdfGeneratorModule } from '../pdf-generator/pdf-generator.module';
import { GuarantorModule } from '../guarantor/guarantor.module';
import { GuarantorService } from '../guarantor/guarantor.module';
import { CompanyModule } from '../company/company.module';
import { CompanyService } from '../company/company.module';

// ── FINANCIAL CALCULATOR ──────────────────────────────────────
// Modelo simple: total = principal * (1 + totalRate), cuota = total / periods
// Modelo clásico: amortización con tasa periódica compuesta
@Injectable()
export class FinancialCalculator {

  getFrequencyDays(frequency: string): number {
    const map: Record<string, number> = { DIARIO: 1, SEMANAL: 7, QUINCENAL: 15, MENSUAL: 30 };
    return map[frequency] ?? 1;
  }

  // ── INTERÉS SIMPLE TOTAL ─────────────────────────────────────
  calculateSimple(principal: number, totalRate: number, periods: number) {
    const totalAmount   = this.round(principal * (1 + totalRate));
    const totalInterest = this.round(totalAmount - principal);
    const periodicPayment = this.round(totalAmount / periods);
    return { totalAmount, totalInterest, periodicPayment };
  }

  generateSimpleTable(
    principal: number, totalRate: number, periods: number,
    startDate: Date, frequencyDays: number,
  ) {
    const { totalAmount, periodicPayment } = this.calculateSimple(principal, totalRate, periods);
    const interestTotal    = this.round(totalAmount - principal);
    const interestPerPeriod = this.round(interestTotal / periods);
    const capitalPerPeriod  = this.round(principal / periods);
    const table = [];
    let balance = totalAmount;

    for (let i = 1; i <= periods; i++) {
      const pmt = i < periods ? periodicPayment : this.round(balance);
      balance = this.round(Math.max(0, balance - pmt));
      table.push({
        period: i,
        dueDate: addDays(startDate, i * frequencyDays),
        payment: pmt,
        principal: capitalPerPeriod,
        interest: interestPerPeriod,
        balance,
      });
    }
    return table;
  }

  // ── INTERÉS PERIÓDICO COMPUESTO ───────────────────────────────
  calculatePeriodicPayment(principal: number, rate: number, periods: number): number {
    if (rate === 0) return principal / periods;
    return principal * (rate * Math.pow(1 + rate, periods)) / (Math.pow(1 + rate, periods) - 1);
  }

  generateAmortizationTable(
    principal: number, rate: number, periods: number,
    startDate: Date, frequencyDays: number,
  ) {
    const payment = this.round(this.calculatePeriodicPayment(principal, rate, periods));
    let balance = principal;
    const table: Array<{
      period: number; dueDate: Date; payment: number;
      principal: number; interest: number; balance: number;
    }> = [];
    for (let i = 1; i <= periods; i++) {
      const interest = this.round(balance * rate);
      const cap = i < periods ? this.round(payment - interest) : this.round(balance);
      balance = this.round(Math.max(0, balance - cap));
      table.push({
        period: i,
        dueDate: addDays(startDate, i * frequencyDays),
        payment: this.round(cap + interest),
        principal: cap, interest, balance,
      });
    }
    return table;
  }

  round(n: number): number { return Math.round(n * 100) / 100; }
}

// ── LOANS SERVICE ─────────────────────────────────────────────
@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan)            private loanRepo: Repository<Loan>,
    @InjectRepository(LoanType)        private loanTypeRepo: Repository<LoanType>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
    @InjectRepository(Customer)        private customerRepo: Repository<Customer>,
    private calculator:     FinancialCalculator,
    private dataSource:     DataSource,
    private pdfService:     PdfGeneratorService,
    private guarantorService: GuarantorService,
    private companyService:   CompanyService,
  ) {}

  async findAll(filters: {
    page?: number; limit?: number; status?: string;
    customerId?: string; search?: string;
  }) {
    const { page = 1, limit = 20 } = filters;
    const qb = this.loanRepo.createQueryBuilder('l')
      .leftJoinAndSelect('l.customer', 'c')
      .leftJoinAndSelect('l.loanType', 'lt')
      .orderBy('l.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit);

    if (filters.status)     qb.andWhere('l.status = :status', { status: filters.status });
    if (filters.customerId) qb.andWhere('l.customerId = :cid', { cid: filters.customerId });
    if (filters.search) {
      qb.andWhere('(c.fullName LIKE :s OR c.phone LIKE :s)', { s: `%${filters.search}%` });
    }
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Loan> {
    const loan = await this.loanRepo.findOne({
      where: { id },
      relations: ['customer', 'loanType', 'paymentSchedules', 'payments'],
    });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    return loan;
  }

  async simulate(dto: {
    principalAmount: number; interestRate?: number; totalRate?: number;
    termWeeks: number; frequency: string;
  }) {
    const freqDays = this.calculator.getFrequencyDays(dto.frequency);
    const periods  = Math.round((dto.termWeeks * 7) / freqDays);

    if (dto.totalRate !== undefined && Number(dto.totalRate) > 0) {
      const { totalAmount, totalInterest, periodicPayment } =
        this.calculator.calculateSimple(dto.principalAmount, dto.totalRate, periods);
      const table = this.calculator.generateSimpleTable(
        dto.principalAmount, dto.totalRate, periods, new Date(), freqDays,
      );
      return { periodicPayment, totalPayment: totalAmount, totalInterest, schedule: table };
    }

    const rate     = Number(dto.interestRate) || 0;
    const periodic = this.calculator.calculatePeriodicPayment(dto.principalAmount, rate, periods);
    const table    = this.calculator.generateAmortizationTable(
      dto.principalAmount, rate, periods, new Date(), freqDays,
    );
    return {
      periodicPayment: this.calculator.round(periodic),
      totalPayment:    this.calculator.round(periodic * periods),
      totalInterest:   this.calculator.round(periodic * periods - dto.principalAmount),
      schedule: table,
    };
  }

  async create(dto: any & { customerId: string; loanTypeId: string }, userId: string): Promise<Loan> {
    const loanType = await this.loanTypeRepo.findOne({ where: { id: dto.loanTypeId } });
    if (!loanType) throw new NotFoundException('Tipo de préstamo no encontrado');

    const freqDays = this.calculator.getFrequencyDays(dto.frequency || loanType.frequency);
    const periods  = Math.round((Number(dto.termWeeks) * 7) / freqDays);

    let periodicPayment: number;
    let totalAmount: number;

    if (dto.totalRate && Number(dto.totalRate) > 0) {
      const calc = this.calculator.calculateSimple(
        Number(dto.principalAmount), Number(dto.totalRate), periods,
      );
      periodicPayment = calc.periodicPayment;
      totalAmount     = calc.totalAmount;
    } else {
      periodicPayment = this.calculator.calculatePeriodicPayment(
        Number(dto.principalAmount), Number(dto.interestRate || 0), periods,
      );
      totalAmount = this.calculator.round(periodicPayment * periods);
    }

    const loan = this.loanRepo.create({
      ...dto,
      frequency:       dto.frequency || loanType.frequency,
      periodicPayment: this.calculator.round(periodicPayment),
      totalAmount:     this.calculator.round(totalAmount),
      createdBy:       userId,
    });
    return this.loanRepo.save(loan);
  }

  async authorize(id: string, decision: 'APPROVE' | 'REJECT', userId: string, rejectionReason?: string): Promise<Loan> {
    const loan = await this.findOne(id);
    if (loan.status !== LoanStatus.SOLICITUD)
      throw new BadRequestException('Solo se pueden autorizar préstamos en estatus SOLICITUD');
    loan.status      = decision === 'APPROVE' ? LoanStatus.AUTORIZADO : LoanStatus.RECHAZADO;
    loan.authorizedBy = userId;
    loan.authorizedAt = new Date();
    if (rejectionReason) loan.rejectionReason = rejectionReason;
    return this.loanRepo.save(loan);
  }

  async disburse(id: string, dto: { disbursementMethod: string; notes?: string }, userId: string) {
    const loan = await this.findOne(id);
    if (loan.status !== LoanStatus.AUTORIZADO)
      throw new BadRequestException('El préstamo no está autorizado para desembolso');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect(); await qr.startTransaction();

    try {
      loan.status             = LoanStatus.ACTIVO;
      loan.disbursedAt        = new Date();
      loan.disbursementMethod = dto.disbursementMethod;
      loan.disbursedBy        = userId;
      if (dto.notes) loan.notes = dto.notes;
      await qr.manager.save(loan);

      const freqDays = this.calculator.getFrequencyDays(loan.frequency);
      const periods  = Math.round((loan.termWeeks * 7) / freqDays);

      // Detectar modelo según si tiene totalRate guardado
      let table: any[];
      if ((loan as any).totalRate && Number((loan as any).totalRate) > 0) {
        table = this.calculator.generateSimpleTable(
          Number(loan.principalAmount), Number((loan as any).totalRate),
          periods, loan.disbursedAt, freqDays,
        );
      } else {
        table = this.calculator.generateAmortizationTable(
          Number(loan.principalAmount), Number(loan.interestRate),
          periods, loan.disbursedAt, freqDays,
        );
      }

      const schedules = table.map((row) =>
        this.scheduleRepo.create({
          loanId: loan.id, periodNumber: row.period, dueDate: row.dueDate,
          principalDue: row.principal, interestDue: row.interest,
          totalDue: row.payment, balanceDue: row.payment,
          status: ScheduleStatus.PENDIENTE,
        }),
      );
      await qr.manager.save(schedules);
      await qr.commitTransaction();
      return { loan, schedulesGenerated: schedules.length };
    } catch (err) {
      await qr.rollbackTransaction(); throw err;
    } finally {
      await qr.release();
    }
  }

  async getSchedule(loanId: string): Promise<PaymentSchedule[]> {
    return this.scheduleRepo.find({ where: { loanId }, order: { periodNumber: 'ASC' } });
  }

  async generateSimulationPdf(dto: any, res: Response): Promise<void> {
    const sim     = await this.simulate(dto);
    const company = await this.companyService.get().catch(() => null);
    return this.pdfService.generateSimulationPdf({
      ...dto, ...sim,
      customerName: dto.customerName,
      generatedAt:  new Date(),
      companyName:  company?.name,
      legalFooter:  company?.legalFooter,
    }, res);
  }

  async generateLoanPdf(id: string, res: Response): Promise<void> {
    const loan = await this.loanRepo.findOne({
      where: { id }, relations: ['customer', 'loanType', 'paymentSchedules'],
    });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    if (!loan.disbursedAt) throw new BadRequestException('El préstamo no ha sido desembolsado');

    const guarantor = await this.guarantorService.findByLoan(id);
    const company   = await this.companyService.get().catch(() => null);
    const schedules = (loan.paymentSchedules || []).sort((a, b) => a.periodNumber - b.periodNumber);

    return this.pdfService.generateLoanPdf({
      loan: {
        id: loan.id,
        principalAmount:    Number(loan.principalAmount),
        interestRate:       Number(loan.interestRate),
        termWeeks:          loan.termWeeks,
        frequency:          loan.frequency,
        periodicPayment:    Number(loan.periodicPayment),
        totalAmount:        Number(loan.totalAmount),
        disbursedAt:        loan.disbursedAt,
        disbursementMethod: loan.disbursementMethod || 'EFECTIVO',
        restructureCount:   loan.restructureCount,
      },
      customer: {
        fullName: loan.customer?.fullName || '',
        curp:     loan.customer?.curp     || '',
        rfc:      loan.customer?.rfc,
        phone:    loan.customer?.phone    || '',
        email:    loan.customer?.email,
        address:  loan.customer?.address,
      },
      loanType:    { name: loan.loanType?.name || '' },
      schedules,
      guarantor: guarantor ? {
        fullName: guarantor.fullName, curp: guarantor.curp, rfc: guarantor.rfc,
        phone: guarantor.phone, address: guarantor.address, relationship: guarantor.relationship,
      } : undefined,
      companyName: company?.name,
      legalFooter: company?.legalFooter,
    }, res);
  }
}

// ── LOANS CONTROLLER ──────────────────────────────────────────
@ApiTags('loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private loansService: LoansService) {}

  @Get()      @Auth() findAll(@Query() q: any) { return this.loansService.findAll(q); }
  @Get(':id') @Auth() findOne(@Param('id') id: string) { return this.loansService.findOne(id); }
  @Post()     @Auth() create(@Body() dto: any, @CurrentUser('id') uid: string) { return this.loansService.create(dto, uid); }

  @Post('simulate')     @Auth() simulate(@Body() dto: any) { return this.loansService.simulate(dto); }
  @Post('simulate/pdf') @Auth() simulatePdf(@Body() dto: any, @Res() res: Response) { return this.loansService.generateSimulationPdf(dto, res); }
  @Get(':id/pdf')       @Auth() loanPdf(@Param('id') id: string, @Res() res: Response) { return this.loansService.generateLoanPdf(id, res); }
  @Get(':id/schedule')  @Auth() getSchedule(@Param('id') id: string) { return this.loansService.getSchedule(id); }

  @Post(':id/authorize') @Auth(UserRole.AUTORIZADOR, UserRole.ADMIN)
  authorize(
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT'; rejectionReason?: string },
    @CurrentUser('id') uid: string,
  ) { return this.loansService.authorize(id, body.decision, uid, body.rejectionReason); }

  @Post(':id/disburse') @Auth(UserRole.ADMIN, UserRole.CAJERO)
  disburse(@Param('id') id: string, @Body() dto: any, @CurrentUser('id') uid: string) {
    return this.loansService.disburse(id, dto, uid);
  }
}

// ── MODULE ───────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([Loan, LoanType, PaymentSchedule, Customer]),
    PdfGeneratorModule, GuarantorModule, CompanyModule,
  ],
  providers: [LoansService, FinancialCalculator],
  controllers: [LoansController],
  exports: [LoansService, FinancialCalculator],
})
export class LoansModule {}