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
    // MORA FIJA REGISTRADA: la mora vive en cada cuota (mora_generada / mora_pagada),
    // estampada por el OverdueJob cuando la cuota se venció. Persiste aunque la
    // cuota se pague después. La mora pendiente = suma de (generada - pagada).
    let moraGenerada = 0;
    let moraPagada = 0;
    let cuotasConMora = 0;
    const detalle: Array<{ periodo: number; dias: number; mora: number; pagada: number; pendiente: number }> = [];
    for (const s of schedules) {
      const gen = Number(s.moraGenerada || 0);
      const pag = Number(s.moraPagada || 0);
      if (gen > 0) {
        moraGenerada += gen;
        moraPagada += pag;
        cuotasConMora += 1;
        const dias = this.moraService.businessDaysOverdue(new Date(s.dueDate), today);
        detalle.push({
          periodo: s.periodNumber, dias,
          mora: this.calculator.round(gen),
          pagada: this.calculator.round(pag),
          pendiente: this.calculator.round(Math.max(0, gen - pag)),
        });
      }
    }
    moraGenerada = this.calculator.round(moraGenerada);
    moraPagada = this.calculator.round(moraPagada);
    const moraPendiente = this.calculator.round(Math.max(0, moraGenerada - moraPagada));
    // totalDiasMora ahora = número de cuotas con mora (compatibilidad de nombre)
    return { moraPorDia, totalDiasMora: cuotasConMora, cuotasConMora, moraGenerada, moraPagada, moraPendiente, detalle };
  }

  async getSaldoPendiente(loanId: string): Promise<number> {
    const schedules = await this.scheduleRepo.find({ where: { loanId } });
    const saldo = schedules
      .filter(s => s.status !== ScheduleStatus.PAGADO)
      .reduce((sum, s) => sum + Number(s.balanceDue), 0);
    return this.calculator.round(saldo);
  }

  // Lista de cuotas pendientes (para que el cobrador marque cuáles paga).
  // Incluye si cada cuota está vencida y su mora fija registrada.
  async getCuotasPendientes(loanId: string) {
    const today = new Date();
    const schedules = await this.scheduleRepo.find({
      where: { loanId },
      order: { periodNumber: 'ASC' },
    });
    return schedules
      .filter((s) => s.status !== ScheduleStatus.PAGADO)
      .map((s) => {
        const dias = this.moraService.businessDaysOverdue(new Date(s.dueDate), today);
        const vencida = dias > 0;
        const gen = Number(s.moraGenerada || 0);
        const pag = Number(s.moraPagada || 0);
        return {
          periodo: s.periodNumber,
          vence: s.dueDate,
          monto: Number(s.balanceDue),
          estatus: s.status,
          vencida,
          // Mora registrada de esta cuota (estampada por el job)
          mora: this.calculator.round(Math.max(0, gen - pag)),
        };
      });
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
    periodos?: number[];   // cuotas específicas marcadas por el cobrador (pago selectivo)
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
    // Cuotas que cubrió este pago (para el ticket): periodo + fecha de vencimiento
    const cuotasPagadas: Array<{ periodo: number; fecha: string }> = [];

    if (paymentType === 'MORATORIO') {
      // Abonar a la mora REGISTRADA de las cuotas, en orden de periodo.
      // Cada cuota tiene mora_generada y mora_pagada; se incrementa mora_pagada
      // hasta agotar el monto recibido.
      const conMora = await this.scheduleRepo.find({
        where: { loanId: dto.loanId },
        order: { periodNumber: 'ASC' },
      });
      for (const schedule of conMora) {
        if (remaining <= 0) break;
        const gen = Number(schedule.moraGenerada || 0);
        const pag = Number(schedule.moraPagada || 0);
        const pendiente = this.calculator.round(Math.max(0, gen - pag));
        if (pendiente <= 0) continue;
        const abono = this.calculator.round(Math.min(remaining, pendiente));
        schedule.moraPagada = this.calculator.round(pag + abono);
        lateInterestApplied += abono;
        remaining = this.calculator.round(remaining - abono);
        await this.scheduleRepo.save(schedule);
      }
      lateInterestApplied = this.calculator.round(lateInterestApplied);
    } else {
      const schedules = await this.scheduleRepo.find({
        where: { loanId: dto.loanId, status: ScheduleStatus.PENDIENTE },
        order: { periodNumber: 'ASC' },
      });

      // SELECCIÓN DE CUOTAS A PAGAR:
      // - Si llega `periodos` (lista de números de cuota marcados por el cobrador),
      //   se pagan exactamente esas cuotas, en orden, aunque se salten días.
      //   Ej: cliente no pagó la 12, pero paga la 15 y 16 → periodos = [15, 16].
      // - Si no llega `periodos`: comportamiento clásico
      //   DIA = la cuota pendiente más antigua; TOTAL = todas.
      let targetSchedules;
      if (Array.isArray(dto.periodos) && dto.periodos.length > 0) {
        const setPeriodos = new Set(dto.periodos.map((n) => Number(n)));
        targetSchedules = schedules
          .filter((s) => setPeriodos.has(s.periodNumber))
          .sort((a, b) => a.periodNumber - b.periodNumber);
      } else {
        targetSchedules = paymentType === 'DIA' ? schedules.slice(0, 1) : schedules;
      }

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
        // Registrar la cuota cubierta para el ticket (fecha de vencimiento en YYYY-MM-DD)
        if (applyAmount > 0) {
          const due = new Date(schedule.dueDate);
          const fechaStr = `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, '0')}-${String(due.getUTCDate()).padStart(2, '0')}`;
          cuotasPagadas.push({ periodo: schedule.periodNumber, fecha: fechaStr });
        }
      }
      if (dto.applyExcedenteToMora && remaining > 0) {
        // El excedente abona a la mora registrada de las cuotas, en orden.
        const conMora = await this.scheduleRepo.find({
          where: { loanId: dto.loanId },
          order: { periodNumber: 'ASC' },
        });
        for (const schedule of conMora) {
          if (remaining <= 0) break;
          const gen = Number(schedule.moraGenerada || 0);
          const pag = Number(schedule.moraPagada || 0);
          const pendiente = this.calculator.round(Math.max(0, gen - pag));
          if (pendiente <= 0) continue;
          const abono = this.calculator.round(Math.min(remaining, pendiente));
          schedule.moraPagada = this.calculator.round(pag + abono);
          lateInterestApplied += abono;
          remaining = this.calculator.round(remaining - abono);
          await this.scheduleRepo.save(schedule);
        }
        lateInterestApplied = this.calculator.round(lateInterestApplied);
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
      // Cuotas que cubrió este pago (JSON), para el ticket
      cuotasPagadas: cuotasPagadas.length > 0 ? JSON.stringify(cuotasPagadas) : null,
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

  @Get('cuotas/:loanId') @Auth()
  cuotasPendientes(@Param('loanId') loanId: string) {
    return this.paymentsService.getCuotasPendientes(loanId);
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
