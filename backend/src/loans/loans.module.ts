import 'dotenv/config';
import {
  Module, Controller, Injectable, Get, Post, Put, Patch,
  Body, Param, Query, Res, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import {
  Loan, LoanType, PaymentSchedule, Customer, PlazoCredito,
  LoanStatus, ScheduleStatus, UserRole,
} from '../common/entities';
import { Auth, CurrentUser } from '../common/guards/roles.guard';
import { PdfGeneratorService } from '../pdf-generator/pdf-generator.service';
import { PdfGeneratorModule } from '../pdf-generator/pdf-generator.module';
import { GuarantorModule } from '../guarantor/guarantor.module';
import { GuarantorService } from '../guarantor/guarantor.module';
import { CompanyModule } from '../company/company.module';
import { CompanyService } from '../company/company.module';
import { PlazosCreditoModule, PlazosCreditoService } from '../plazos-credito/plazos-credito.module';

// ── FINANCIAL CALCULATOR ──────────────────────────────────────
// Modelo Microcapital: total = monto * porcentaje * 4 + monto
//                      cuota = total / dias
// El calendario solo cuenta días hábiles (Lunes a Viernes),
// empezando el día hábil siguiente al desembolso.
@Injectable()
export class FinancialCalculator {

  // Multiplicador fijo de la fórmula
  static readonly FACTOR = 4;

  // ── CÁLCULO PRINCIPAL ────────────────────────────────────────
  // total = principal * percentage * 4 + principal
  calculate(principal: number, percentage: number, days: number) {
    const totalInterest = this.round(principal * percentage * FinancialCalculator.FACTOR);
    const totalAmount   = this.round(principal + totalInterest);
    const periodicPayment = this.round(totalAmount / days);
    return { totalAmount, totalInterest, periodicPayment };
  }

  // ── DÍAS HÁBILES (Lunes a Viernes) ───────────────────────────
  // IMPORTANTE: todo el cálculo se hace en UTC para evitar que la zona
  // horaria del servidor (Hostinger corre en UTC) corra las fechas un día.

  // Ancla una fecha a "medianoche del día en México" expresado como UTC.
  // México es UTC-6. Una fecha/hora cualquiera se convierte al día-calendario
  // que corresponde en México y se fija a las 00:00 UTC de ese día.
  // Así el cálculo de día de la semana y el guardado en BD son consistentes.
  anchorToMexicoDay(date: Date): Date {
    const MX_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC-6
    const mxTime = new Date(date.getTime() - MX_OFFSET_MS);
    // Tomar el día-calendario en México y fijarlo a medianoche UTC
    const d = new Date(Date.UTC(
      mxTime.getUTCFullYear(), mxTime.getUTCMonth(), mxTime.getUTCDate(), 0, 0, 0, 0,
    ));
    return d;
  }

  // Devuelve el siguiente día hábil ESTRICTAMENTE después de 'date'
  nextBusinessDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    do {
      d.setUTCDate(d.getUTCDate() + 1);
    } while (this.isWeekend(d));
    return d;
  }

  isWeekend(date: Date): boolean {
    const day = date.getUTCDay(); // 0=domingo, 6=sábado
    return day === 0 || day === 6;
  }

  // Genera un array de N fechas hábiles consecutivas empezando
  // el primer día hábil DESPUÉS de startDate
  generateBusinessDates(startDate: Date, count: number): Date[] {
    const dates: Date[] = [];
    let cursor = this.anchorToMexicoDay(startDate);
    for (let i = 0; i < count; i++) {
      cursor = this.nextBusinessDay(cursor);
      dates.push(new Date(cursor));
    }
    return dates;
  }

  // ── TABLA DE AMORTIZACIÓN (calendario L-V) ───────────────────
  // days = número de pagos (un pago por día hábil)
  generateScheduleTable(
    principal: number, percentage: number, days: number, startDate: Date,
  ) {
    const { totalAmount, periodicPayment } = this.calculate(principal, percentage, days);
    const interestTotal     = this.round(totalAmount - principal);
    const interestPerPeriod = this.round(interestTotal / days);
    const capitalPerPeriod  = this.round(principal / days);

    const dates = this.generateBusinessDates(startDate, days);
    const table = [];
    let balance = totalAmount;

    for (let i = 1; i <= days; i++) {
      const pmt = i < days ? periodicPayment : this.round(balance);
      balance = this.round(Math.max(0, balance - pmt));
      table.push({
        period: i,
        dueDate: dates[i - 1],
        payment: pmt,
        principal: capitalPerPeriod,
        interest: interestPerPeriod,
        balance,
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
    private calculator:       FinancialCalculator,
    private dataSource:       DataSource,
    private pdfService:       PdfGeneratorService,
    private guarantorService: GuarantorService,
    private companyService:   CompanyService,
    private plazosService:    PlazosCreditoService,
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

  // ── SIMULAR ──────────────────────────────────────────────────
  // days = plazo en días (determina el % automáticamente)
  async simulate(dto: {
    principalAmount: number; termWeeks: number; frequency?: string;
    days?: number; percentage?: number;
  }) {
    const principal = Number(dto.principalAmount);
    const days = Number(dto.days ?? dto.termWeeks);
    // El % se resuelve automáticamente por el plazo configurado,
    // salvo que venga uno explícito (preview manual)
    const percentage = dto.percentage != null
      ? Number(dto.percentage)
      : await this.plazosService.getPercentageForDays(days);

    const { totalAmount, totalInterest, periodicPayment } =
      this.calculator.calculate(principal, percentage, days);
    const table = this.calculator.generateScheduleTable(
      principal, percentage, days, new Date(),
    );
    return {
      periodicPayment,
      totalPayment: totalAmount,
      totalInterest,
      percentage,
      days,
      schedule: table,
    };
  }

  async create(dto: any & { customerId: string; loanTypeId: string }, userId: string): Promise<Loan> {
    const loanType = await this.loanTypeRepo.findOne({ where: { id: dto.loanTypeId } });
    if (!loanType) throw new NotFoundException('Tipo de préstamo no encontrado');

    const principal = Number(dto.principalAmount);
    const days = Number(dto.days ?? dto.termWeeks);
    // Resolver % por el plazo configurado
    const percentage = await this.plazosService.getPercentageForDays(days);

    const { totalAmount, periodicPayment } =
      this.calculator.calculate(principal, percentage, days);

    const loan = this.loanRepo.create({
      ...dto,
      termWeeks:       days,
      frequency:       'DIARIO',
      interestRate:    percentage,       // guardamos el % aplicado
      totalRate:       percentage,       // compatibilidad con PDFs
      periodicPayment: this.calculator.round(periodicPayment),
      totalAmount:     this.calculator.round(totalAmount),
      createdBy:       userId,
    } as any);
    return this.loanRepo.save(loan as any);
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

  // ── DESEMBOLSAR (genera calendario L-V) ──────────────────────
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

      const days       = Math.round(loan.termWeeks);
      const percentage = Number((loan as any).totalRate || loan.interestRate);

      // Calendario L-V empezando el día hábil siguiente al desembolso
      const table = this.calculator.generateScheduleTable(
        Number(loan.principalAmount), percentage, days, loan.disbursedAt,
      );

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

  // ── REESTRUCTURAR ────────────────────────────────────────────
  async restructure(id: string, dto: any, userId: string) {
    const loan = await this.findOne(id);
    if (!['ACTIVO', 'VENCIDO', 'REESTRUCTURADO'].includes(loan.status))
      throw new BadRequestException('Solo se pueden reestructurar créditos ACTIVO o VENCIDO');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect(); await qr.startTransaction();

    try {
      loan.status = LoanStatus.REESTRUCTURADO;
      await qr.manager.save(loan);

      const principal = Number(dto.principalAmount);
      const days = Number(dto.days ?? dto.termWeeks);
      const percentage = dto.percentage != null
        ? Number(dto.percentage)
        : await this.plazosService.getPercentageForDays(days);

      const { totalAmount, periodicPayment } =
        this.calculator.calculate(principal, percentage, days);

      const newLoan = this.loanRepo.create({
        customerId:         loan.customerId,
        loanTypeId:         dto.loanTypeId || loan.loanTypeId,
        parentLoanId:       loan.id,
        principalAmount:    principal,
        interestRate:       percentage,
        totalRate:          percentage,
        termWeeks:          days,
        frequency:          'DIARIO',
        status:             LoanStatus.ACTIVO,
        disbursedAt:        new Date(),
        disbursedBy:        userId,
        disbursementMethod: 'REESTRUCTURA',
        periodicPayment:    this.calculator.round(periodicPayment),
        totalAmount:        this.calculator.round(totalAmount),
        restructureCount:   (loan.restructureCount || 0) + 1,
        restructureReason:  dto.restructureReason,
        createdBy:          userId,
      } as any);
      const saved = await qr.manager.save(newLoan as any);

      const table = this.calculator.generateScheduleTable(
        principal, percentage, days, new Date(),
      );
      const schedules = table.map((row: any) =>
        this.scheduleRepo.create({
          loanId: saved.id, periodNumber: row.period, dueDate: row.dueDate,
          principalDue: row.principal, interestDue: row.interest,
          totalDue: row.payment, balanceDue: row.payment,
          status: ScheduleStatus.PENDIENTE,
        }),
      );
      await qr.manager.save(schedules);
      await qr.commitTransaction();
      return { loan: saved, schedulesGenerated: schedules.length };
    } catch (err) {
      await qr.rollbackTransaction(); throw err;
    } finally {
      await qr.release();
    }
  }

  async getSchedule(loanId: string): Promise<PaymentSchedule[]> {
    return this.scheduleRepo.find({ where: { loanId }, order: { periodNumber: 'ASC' } });
  }

  // ── PRÓXIMOS A LIQUIDAR (feature 11) ─────────────────────────
  // Créditos ACTIVO/VENCIDO con 3 o menos cuotas pendientes.
  // Lista informativa para el administrador.
  async getProximosLiquidar(maxPendientes = 3) {
    const loans = await this.loanRepo.find({
      where: [
        { status: LoanStatus.ACTIVO },
        { status: LoanStatus.VENCIDO },
      ],
      relations: ['customer'],
    });

    const rows = [];
    for (const loan of loans) {
      const pendientes = await this.scheduleRepo.count({
        where: [
          { loanId: loan.id, status: ScheduleStatus.PENDIENTE },
          { loanId: loan.id, status: ScheduleStatus.PARCIAL },
        ],
      });
      if (pendientes > 0 && pendientes <= maxPendientes) {
        rows.push({
          id: loan.id,
          customerId: loan.customerId,
          customerName: loan.customer?.fullName || '',
          customerPhone: loan.customer?.phone || '',
          principalAmount: Number(loan.principalAmount),
          periodicPayment: Number(loan.periodicPayment),
          totalAmount: Number(loan.totalAmount),
          termWeeks: loan.termWeeks,
          status: loan.status,
          disbursedAt: loan.disbursedAt,
          cuotasPendientes: pendientes,
        });
      }
    }

    // Ordenar: menos cuotas pendientes primero (más cerca de liquidar)
    rows.sort((a, b) => a.cuotasPendientes - b.cuotasPendientes);
    return { data: rows, total: rows.length };
  }

  async generateControlCard(id: string, res: Response): Promise<void> {
    const loan = await this.loanRepo.findOne({
      where: { id }, relations: ['customer', 'loanType'],
    });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    if (!loan.disbursedAt) throw new BadRequestException('El préstamo no ha sido desembolsado');

    const guarantor = await this.guarantorService.findByLoan(id);
    const company   = await this.companyService.get().catch(() => null);
    const loanCount = await this.loanRepo.count({ where: { customerId: loan.customerId } });

    return this.pdfService.generateControlCard({
      loan: {
        id:             loan.id,
        principalAmount: Number(loan.principalAmount),
        interestRate:   Number(loan.interestRate),
        totalRate:      Number((loan as any).totalRate || 0),
        termWeeks:      loan.termWeeks,
        frequency:      loan.frequency,
        periodicPayment: Number(loan.periodicPayment),
        totalAmount:    Number(loan.totalAmount),
        disbursedAt:    loan.disbursedAt,
      },
      customer: {
        fullName: loan.customer?.fullName || '',
        phone:    loan.customer?.phone    || '',
        curp:     loan.customer?.curp     || '',
      },
      guarantor: guarantor ? {
        fullName: guarantor.fullName,
        phone:    guarantor.phone,
      } : undefined,
      companyName: company?.name,
      loanNumber:  loanCount,
    }, res);
  }

  async generateSimulationPdf(dto: any, res: Response): Promise<void> {
    const sim     = await this.simulate(dto);
    const company = await this.companyService.get().catch(() => null);
    return this.pdfService.generateSimulationPdf({
      principalAmount: dto.principalAmount,
      interestRate:    sim.percentage,
      termWeeks:       sim.days,
      frequency:       'DIARIO',
      totalRate:       sim.percentage,
      periodicPayment: sim.periodicPayment,
      totalPayment:    sim.totalPayment,
      totalInterest:   sim.totalInterest,
      schedule:        sim.schedule,
      customerName:    dto.customerName,
      generatedAt:     new Date(),
      companyName:     company?.name,
      legalFooter:     company?.legalFooter,
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
        totalRate:          Number((loan as any).totalRate || 0),
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
  @Get('reportes/proximos-liquidar') @Auth() proximosLiquidar(@Query('max') max?: string) {
    return this.loansService.getProximosLiquidar(max ? Number(max) : 3);
  }
  @Get(':id') @Auth() findOne(@Param('id') id: string) { return this.loansService.findOne(id); }
  @Post()     @Auth() create(@Body() dto: any, @CurrentUser('id') uid: string) { return this.loansService.create(dto, uid); }

  @Post('simulate')     @Auth() simulate(@Body() dto: any) { return this.loansService.simulate(dto); }
  @Post('simulate/pdf') @Auth() simulatePdf(@Body() dto: any, @Res() res: Response) { return this.loansService.generateSimulationPdf(dto, res); }
  @Get(':id/pdf')       @Auth() loanPdf(@Param('id') id: string, @Res() res: Response) { return this.loansService.generateLoanPdf(id, res); }
  @Get(':id/schedule')  @Auth() getSchedule(@Param('id') id: string) { return this.loansService.getSchedule(id); }
  @Get(':id/control-card') @Auth() controlCard(@Param('id') id: string, @Res() res: Response) { return this.loansService.generateControlCard(id, res); }

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

  @Post(':id/restructure') @Auth(UserRole.ADMIN, UserRole.AUTORIZADOR)
  restructure(@Param('id') id: string, @Body() dto: any, @CurrentUser('id') uid: string) {
    return this.loansService.restructure(id, dto, uid);
  }
}

// ── MODULE ───────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([Loan, LoanType, PaymentSchedule, Customer, PlazoCredito]),
    PdfGeneratorModule, GuarantorModule, CompanyModule, PlazosCreditoModule,
  ],
  providers: [LoansService, FinancialCalculator],
  controllers: [LoansController],
  exports: [LoansService, FinancialCalculator],
})
export class LoansModule {}