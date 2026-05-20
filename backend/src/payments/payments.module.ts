import {
  Module, Controller, Injectable, Get, Post,
  Body, Param, Query, Res, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import {
  Payment, PaymentSchedule, Loan, CashSession,
  LoanStatus, ScheduleStatus, PaymentMethod, PaymentSource, SyncStatus, UserRole,
} from '../common/entities';
import { Auth, CurrentUser } from '../common/guards/roles.guard';
import { LoansModule } from '../loans/loans.module';
import { FinancialCalculator } from '../loans/loans.module';
import { LateFeeRulesModule, LateFeeRulesService } from '../late-fee-rules/late-fee-rules.module';
import { CompanyModule, CompanyService } from '../company/company.module';
import { PdfGeneratorModule } from '../pdf-generator/pdf-generator.module';
import { PdfGeneratorService } from '../pdf-generator/pdf-generator.service';

// ── PAYMENTS SERVICE ──────────────────────────────────────────
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(CashSession) private cashRepo: Repository<CashSession>,
    private calculator: FinancialCalculator,
    private dataSource: DataSource,
    private lateFeeService: LateFeeRulesService,
    private companyService: CompanyService,
    private pdfService: PdfGeneratorService,
  ) {}

  async register(dto: {
    loanId: string; amountPaid: number;
    method?: PaymentMethod; source?: PaymentSource;
    reference?: string; notes?: string; localId?: string;
  }, userId: string, source: PaymentSource = PaymentSource.CAJA) {
    const loan = await this.loanRepo.findOne({
      where: { id: dto.loanId },
      relations: ['loanType'],
    });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    if (![LoanStatus.ACTIVO, LoanStatus.VENCIDO].includes(loan.status as LoanStatus))
      throw new BadRequestException('El préstamo no está activo');

    // Buscar sesión de caja activa
    const cashSession = await this.cashRepo.findOne({
      where: { cashierId: userId, closedAt: null as any },
    });

    const today = new Date();
    const schedules = await this.scheduleRepo.find({
      where: { loanId: dto.loanId, status: ScheduleStatus.PENDIENTE },
      order: { periodNumber: 'ASC' },
    });

    let remaining = Number(dto.amountPaid);
    let capitalApplied = 0;
    let interestApplied = 0;
    let lateInterestApplied = 0;

    for (const schedule of schedules) {
      if (remaining <= 0) break;

      // Calcular moratorio de esta cuota
      const lateFee = await this.lateFeeService.calculateLateFee(
        loan.loanTypeId,
        Number(schedule.balanceDue),
        new Date(schedule.dueDate),
        today,
      );
      if (lateFee.feeAmount > 0) {
        schedule.lateInterest = lateFee.feeAmount;
        lateInterestApplied += lateFee.feeAmount;
      }

      // Aplicar pago a la cuota
      const applyAmount = Math.min(remaining, Number(schedule.totalDue));
      const interestPart = Math.min(applyAmount, Number(schedule.interestDue));
      const capitalPart = this.calculator.round(applyAmount - interestPart);

      interestApplied += interestPart;
      capitalApplied  += capitalPart;
      remaining        = this.calculator.round(remaining - applyAmount);

      schedule.balanceDue = this.calculator.round(Math.max(0, Number(schedule.balanceDue) - applyAmount));
      schedule.status = schedule.balanceDue <= 0 ? ScheduleStatus.PAGADO : ScheduleStatus.PARCIAL;
      if (schedule.status === ScheduleStatus.PAGADO) schedule.paidAt = today;
      await this.scheduleRepo.save(schedule);
    }

    // Folio de comprobante
    const [seqResult] = await this.dataSource.query(
      'INSERT INTO secuencia_comprobantes (dummy) VALUES (1)'
    );
    const receiptNumber = `REC-${String(seqResult?.insertId || Date.now()).padStart(6, '0')}`;

    const payment = this.paymentRepo.create({
      loanId: dto.loanId,
      collectorId: source === PaymentSource.COBRADOR ? userId : undefined,
      cashSessionId: cashSession?.id,
      amountPaid: dto.amountPaid,
      capitalApplied: this.calculator.round(capitalApplied),
      interestApplied: this.calculator.round(interestApplied),
      lateInterestApplied: this.calculator.round(lateInterestApplied),
      paymentDate: today,
      method: dto.method || PaymentMethod.EFECTIVO,
      source,
      reference: dto.reference,
      notes: dto.notes,
      localId: dto.localId,
      syncStatus: SyncStatus.SYNCED,
      receiptNumber,
      createdBy: userId,
    });
    const saved = await this.paymentRepo.save(payment);

    // Verificar si el préstamo está liquidado
    const pendingCount = await this.scheduleRepo.count({
      where: { loanId: dto.loanId, status: ScheduleStatus.PENDIENTE },
    });
    if (pendingCount === 0) {
      await this.loanRepo.update(dto.loanId, { status: LoanStatus.LIQUIDADO });
    }

    return { payment: saved, applied: { capitalApplied, interestApplied, lateInterestApplied } };
  }

  async getHistory(loanId: string): Promise<Payment[]> {
    return this.paymentRepo.find({
      where: { loanId },
      order: { createdAt: 'DESC' },
    });
  }

  async getTodayPayments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.paymentRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.loan', 'l')
      .leftJoinAndSelect('l.customer', 'c')
      .where('p.paymentDate >= :today', { today })
      .andWhere('p.paymentDate < :tomorrow', { tomorrow })
      .orderBy('p.paymentDate', 'DESC')
      .getMany();
  }

  async generateReceipt(paymentId: string, res: Response): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    const loan = await this.loanRepo.findOne({
      where: { id: payment.loanId },
      relations: ['customer', 'loanType'],
    });
    const company = await this.companyService.get();
    return this.pdfService.generatePaymentReceipt({ payment, loan, company }, res);
  }
}

// ── PAYMENTS CONTROLLER ───────────────────────────────────────
@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post() @Auth()
  register(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.paymentsService.register(dto, userId);
  }

  @Get('today') @Auth()
  today() { return this.paymentsService.getTodayPayments(); }

  @Get('history/:loanId') @Auth()
  history(@Param('loanId') loanId: string) {
    return this.paymentsService.getHistory(loanId);
  }

  @Get(':id/receipt') @Auth()
  receipt(@Param('id') id: string, @Res() res: Response) {
    return this.paymentsService.generateReceipt(id, res);
  }
}

// ── MODULE ───────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentSchedule, Loan, CashSession]),
    LoansModule,
    LateFeeRulesModule,
    CompanyModule,
    PdfGeneratorModule,
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}