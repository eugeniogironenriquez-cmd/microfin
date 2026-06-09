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
import { CompanyModule, CompanyService } from '../company/company.module';
import { PdfGeneratorModule } from '../pdf-generator/pdf-generator.module';
import { PdfGeneratorService } from '../pdf-generator/pdf-generator.service';
import { ConfigMoraModule, ConfigMoraService } from '../config-mora/config-mora.module';

type PaymentType = 'DIA' | 'TOTAL' | 'MORATORIO';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(CashSession) private cashRepo: Repository<CashSession>,
    private calculator: FinancialCalculator,
    private dataSource: DataSource,
    private companyService: CompanyService,
    private pdfService: PdfGeneratorService,
    private moraService: ConfigMoraService,
  ) {}

  async getMoraInfo(loanId: string) {
    const moraPorDia = await this.moraService.getMoraPorDia();
    const today = new Date();
    const schedules = await this.scheduleRepo.find({
      where: { loanId }, order: { periodNumber: 'ASC' },
    });
    let totalDiasMora = 0;
    const detalle: Array<{ periodo: number; dias: number; mora: number }> = [];
    for (const s of schedules) {
      if (s.status === ScheduleStatus.PAGADO) continue;
      const dias = this.moraService.businessDaysOverdue(new Date(s.dueDate), today);
      if (dias > 0) {
        totalDiasMora += dias;
        detalle.push({ periodo: s.periodNumber, dias, mora: this.calculator.round(dias * moraPorDia) });
      }
    }
    const moraGenerada = this.calculator.round(totalDiasMora * moraPorDia);
    const pagosPrevios = await this.paymentRepo.find({ where: { loanId } });
    const moraPagada = this.calculator.round(
      pagosPrevios.reduce((sum, p) => sum + Number(p.lateInterestApplied || 0), 0)
    );
    const moraPendiente = this.calculator.round(Math.max(0, moraGenerada - moraPagada));
    return { moraPorDia, totalDiasMora, moraGenerada, moraPagada, moraPendiente, detalle };
  }

  async getSaldoPendiente(loanId: string): Promise<number> {
    const schedules = await this.scheduleRepo.find({ where: { loanId } });
    const saldo = schedules
      .filter(s => s.status !== ScheduleStatus.PAGADO)
      .reduce((sum, s) => sum + Number(s.balanceDue), 0);
    return this.calculator.round(saldo);
  }

  async getPaymentInfo(loanId: string) {
    const loan = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    const mora = await this.getMoraInfo(loanId);
    const saldoPendiente = await this.getSaldoPendiente(loanId);
    const nextDue = await this.scheduleRepo.findOne({
      where: { loanId, status: ScheduleStatus.PENDIENTE },
      order: { periodNumber: 'ASC' },
    });
    return {
      cuotaDiaria: Number(loan.periodicPayment),
      saldoPendiente,
      moraPendiente: mora.moraPendiente,
      moraPorDia: mora.moraPorDia,
      totalDiasMora: mora.totalDiasMora,
      proximaCuota: nextDue ? {
        periodo: nextDue.periodNumber, vence: nextDue.dueDate, monto: Number(nextDue.balanceDue),
      } : null,
    };
  }

  async register(dto: {
    loanId: string; amountPaid: number;
    paymentType?: PaymentType; applyExcedenteToMora?: boolean;
    method?: PaymentMethod; source?: PaymentSource;
    reference?: string; notes?: string; localId?: string;
    lat?: number; lng?: number;
  }, userId: string, source: PaymentSource = PaymentSource.CAJA) {

    // IDEMPOTENCIA: si ya existe un pago con este localId, devolverlo (no duplicar)
    if (dto.localId) {
      const existing = await this.paymentRepo.findOne({ where: { localId: dto.localId } });
      if (existing) {
        return {
          payment: existing,
          applied: {
            capitalApplied: Number(existing.capitalApplied),
            interestApplied: Number(existing.interestApplied),
            lateInterestApplied: Number(existing.lateInterestApplied),
          },
          excedente: 0, liquidado: false, duplicate: true,
        };
      }
    }

    const loan = await this.loanRepo.findOne({ where: { id: dto.loanId }, relations: ['loanType'] });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    if (![LoanStatus.ACTIVO, LoanStatus.VENCIDO].includes(loan.status as LoanStatus))
      throw new BadRequestException('El préstamo no está activo');

    const paymentType: PaymentType = dto.paymentType || 'DIA';
    const today = new Date();
    const cashSession = await this.cashRepo.findOne({ where: { cashierId: userId, closedAt: null as any } });

    let remaining = Number(dto.amountPaid);
    let capitalApplied = 0, interestApplied = 0, lateInterestApplied = 0;

    if (paymentType === 'MORATORIO') {
      const mora = await this.getMoraInfo(dto.loanId);
      lateInterestApplied = this.calculator.round(Math.min(remaining, mora.moraPendiente));
      remaining = this.calculator.round(remaining - lateInterestApplied);
    } else {
      const schedules = await this.scheduleRepo.find({
        where: { loanId: dto.loanId, status: ScheduleStatus.PENDIENTE },
        order: { periodNumber: 'ASC' },
      });
      const targetSchedules = paymentType === 'DIA' ? schedules.slice(0, 1) : schedules;
      for (const schedule of targetSchedules) {
        if (remaining <= 0) break;
        const applyAmount = Math.min(remaining, Number(schedule.balanceDue));
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
      if (dto.applyExcedenteToMora && remaining > 0) {
        const mora = await this.getMoraInfo(dto.loanId);
        const aplicarMora = this.calculator.round(Math.min(remaining, mora.moraPendiente));
        lateInterestApplied += aplicarMora;
        remaining = this.calculator.round(remaining - aplicarMora);
      }
    }

    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const countResult = await this.dataSource.query(
      'SELECT COUNT(*) as cnt FROM pagos WHERE fecha_pago >= ?', [todayStart]
    );
    const seq = Number(countResult?.[0]?.cnt || 0) + 1;
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const receiptNumber = `REC-${dateStr}-${String(seq).padStart(4,'0')}`;

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
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      syncStatus: SyncStatus.SYNCED,
      receiptNumber,
      createdBy: userId,
    });
    const saved = await this.paymentRepo.save(payment);

    const pendingCount = await this.scheduleRepo.count({
      where: { loanId: dto.loanId, status: ScheduleStatus.PENDIENTE },
    });
    if (pendingCount === 0) {
      await this.loanRepo.update(dto.loanId, { status: LoanStatus.LIQUIDADO });
    }

    return {
      payment: saved,
      applied: { capitalApplied, interestApplied, lateInterestApplied },
      excedente: this.calculator.round(remaining),
      liquidado: pendingCount === 0,
    };
  }

  async getHistory(loanId: string): Promise<Payment[]> {
    return this.paymentRepo.find({ where: { loanId }, order: { createdAt: 'DESC' } });
  }

  async getTodayPayments() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    return this.paymentRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.loan', 'l')
      .leftJoinAndSelect('l.customer', 'c')
      .where('p.paymentDate >= :today', { today })
      .andWhere('p.paymentDate < :tomorrow', { tomorrow })
      .orderBy('p.paymentDate', 'DESC')
      .getMany();
  }

  // Pagos con geolocalización para el monitor web (mapa de cobranza)
  async getGeoPayments(date?: string) {
    const day = date ? new Date(date) : new Date();
    day.setHours(0, 0, 0, 0);
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const rows = await this.paymentRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.loan', 'l')
      .leftJoinAndSelect('l.customer', 'c')
      .where('p.paymentDate >= :day', { day })
      .andWhere('p.paymentDate < :next', { next })
      .andWhere('p.lat IS NOT NULL')
      .orderBy('p.paymentDate', 'DESC')
      .getMany();

    // Resolver nombres de cobradores en una sola consulta
    const collectorIds = [...new Set(rows.map((p: any) => p.collectorId).filter(Boolean))];
    const collectorMap: Record<string, string> = {};
    if (collectorIds.length > 0) {
      const users = await this.dataSource.query(
        `SELECT id, nombre FROM usuarios WHERE id IN (${collectorIds.map(() => '?').join(',')})`,
        collectorIds
      );
      for (const u of users) collectorMap[u.id] = u.nombre;
    }

    return rows.map((p: any) => ({
      id: p.id, lat: Number(p.lat), lng: Number(p.lng),
      amount: Number(p.amountPaid), collectorId: p.collectorId,
      collectorName: p.collectorId ? (collectorMap[p.collectorId] || null) : null,
      customerName: p.loan?.customer?.fullName,
      paymentDate: p.paymentDate, receiptNumber: p.receiptNumber,
    }));
  }

  async generateReceipt(paymentId: string, res: Response): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    const loan = await this.loanRepo.findOne({
      where: { id: payment.loanId }, relations: ['customer', 'loanType'],
    });
    const company = await this.companyService.get();
    return this.pdfService.generatePaymentReceipt({ payment, loan, company }, res);
  }
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post() @Auth()
  register(@Body() dto: any, @CurrentUser('id') userId: string) {
    const source = dto.source === 'COBRADOR' ? PaymentSource.COBRADOR : PaymentSource.CAJA;
    return this.paymentsService.register(dto, userId, source);
  }

  @Get('info/:loanId') @Auth()
  paymentInfo(@Param('loanId') loanId: string) {
    return this.paymentsService.getPaymentInfo(loanId);
  }

  @Get('mora/:loanId') @Auth()
  mora(@Param('loanId') loanId: string) {
    return this.paymentsService.getMoraInfo(loanId);
  }

  @Get('today') @Auth()
  today() { return this.paymentsService.getTodayPayments(); }

  @Get('geo') @Auth()
  geo(@Query('date') date?: string) {
    return this.paymentsService.getGeoPayments(date);
  }

  @Get('history/:loanId') @Auth()
  history(@Param('loanId') loanId: string) {
    return this.paymentsService.getHistory(loanId);
  }

  @Get(':id/receipt') @Auth()
  receipt(@Param('id') id: string, @Res() res: Response) {
    return this.paymentsService.generateReceipt(id, res);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentSchedule, Loan, CashSession]),
    LoansModule, CompanyModule, PdfGeneratorModule, ConfigMoraModule,
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
