import {
  Module, Controller, Injectable, Get, Post, Delete,
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
import { Auth, AuthPermission, CurrentUser } from '../common/guards/roles.guard';
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
        const pendienteCuota = Math.max(0, gen - pag);
        // Contar solo las cuotas que AÚN tienen mora pendiente (no las saldadas)
        if (pendienteCuota > 0) cuotasConMora += 1;
        const dias = this.moraService.businessDaysOverdue(new Date(s.dueDate), today);
        detalle.push({
          periodo: s.periodNumber, dias,
          mora: this.calculator.round(gen),
          pagada: this.calculator.round(pag),
          pendiente: this.calculator.round(pendienteCuota),
        });
      }
    }
    moraGenerada = this.calculator.round(moraGenerada);
    moraPagada = this.calculator.round(moraPagada);
    const moraPendiente = this.calculator.round(Math.max(0, moraGenerada - moraPagada));
    // totalDiasMora ahora = número de cuotas con mora (compatibilidad de nombre)
    return { moraPorDia, totalDiasMora: cuotasConMora, cuotasConMora, moraGenerada, moraPagada, moraPendiente, detalle };
  }

  // ── CUOTAS CON MORA (para la pantalla de eliminar mora) ──────
  // Devuelve TODAS las cuotas que tienen mora generada (pagadas y no pagadas),
  // marcando cuáles son elegibles para eliminar (solo las PAGADAS).
  async getCuotasConMora(loanId: string) {
    const loan = await this.loanRepo.findOne({
      where: { id: loanId }, relations: ['customer'],
    });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');

    const schedules = await this.scheduleRepo.find({
      where: { loanId }, order: { periodNumber: 'ASC' },
    });

    const cuotas = schedules
      .filter((s) => Number(s.moraGenerada || 0) > 0)
      .map((s) => {
        const gen = Number(s.moraGenerada || 0);
        const pag = Number(s.moraPagada || 0);
        const pendiente = Math.max(0, gen - pag);
        return {
          scheduleId: s.id,
          periodo: s.periodNumber,
          vence: s.dueDate,
          estatus: s.status,
          pagada: s.status === ScheduleStatus.PAGADO,
          moraGenerada: this.calculator.round(gen),
          moraPagada: this.calculator.round(pag),
          moraPendiente: this.calculator.round(pendiente),
          // Solo se puede eliminar la mora de cuotas PAGADAS cuya mora
          // todavía está PENDIENTE (no se elimina mora ya cobrada).
          puedeEliminar: s.status === ScheduleStatus.PAGADO && pendiente > 0,
        };
      });

    return {
      loan: {
        id: loan.id,
        customerName: loan.customer?.fullName || '',
        customerPhone: loan.customer?.phone || '',
        principalAmount: Number(loan.principalAmount),
        status: loan.status,
      },
      cuotas,
      totalMora: this.calculator.round(
        cuotas.reduce((sum, c) => sum + c.moraGenerada, 0),
      ),
    };
  }

  // ── ELIMINAR MORA DE UNA CUOTA (solo cuotas pagadas) ─────────
  // Pone en cero la mora_generada y mora_pagada de una cuota YA PAGADA.
  // Protegido por permiso 'moratorios.eliminar' en el controller.
  async eliminarMoraCuota(scheduleId: string, userId: string) {
    const schedule = await this.scheduleRepo.findOne({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException('Cuota no encontrada');

    if (schedule.status !== ScheduleStatus.PAGADO) {
      throw new BadRequestException(
        'Solo se puede eliminar la mora de cuotas que ya están pagadas.',
      );
    }
    const gen = Number(schedule.moraGenerada || 0);
    const pag = Number(schedule.moraPagada || 0);
    const pendiente = this.calculator.round(Math.max(0, gen - pag));
    if (gen <= 0) {
      throw new BadRequestException('Esta cuota no tiene mora registrada.');
    }
    if (pendiente <= 0) {
      throw new BadRequestException(
        'Esta cuota ya tiene su mora pagada; no hay mora pendiente que eliminar.',
      );
    }

    // Eliminar SOLO la mora pendiente: se reduce la mora generada a lo ya pagado.
    // Así lo que el cliente ya pagó de mora queda intacto, y se condona el resto.
    const moraEliminada = pendiente;
    schedule.moraGenerada = this.calculator.round(pag); // generada = pagada → pendiente queda en 0
    await this.scheduleRepo.save(schedule);

    return {
      ok: true,
      scheduleId,
      periodo: schedule.periodNumber,
      moraEliminada,
      message: `Mora pendiente de la cuota ${schedule.periodNumber} eliminada (${moraEliminada}).`,
    };
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
    if (![LoanStatus.ACTIVO, LoanStatus.VENCIDO,LoanStatus.ATRASADO].includes(loan.status as LoanStatus))
      throw new BadRequestException('El préstamo no está activo');

    const paymentType: PaymentType = dto.paymentType || 'DIA';
    const today = new Date();
    // Hora del pago en horario de México (UTC-6). El servidor corre en UTC, así
    // que restamos 6h para que paymentDate y paidAt queden en hora local de México
    // (ej. 12:43 en vez de 18:43 UTC). La empresa opera solo en Ixtepec.
    const fechaPagoMx = new Date(today.getTime() - 6 * 60 * 60 * 1000);
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
      // - DIA: paga ÚNICAMENTE la cuota cuyo vencimiento es HOY (día-calendario
      //   de México). NO toca las atrasadas. Si hoy no vence ninguna cuota
      //   (fin de semana o ya pagada), no hay nada que pagar en modo DIA.
      // - TOTAL: todas las cuotas pendientes.
      let targetSchedules;
      if (Array.isArray(dto.periodos) && dto.periodos.length > 0) {
        const setPeriodos = new Set(dto.periodos.map((n) => Number(n)));
        targetSchedules = schedules
          .filter((s) => setPeriodos.has(s.periodNumber))
          .sort((a, b) => a.periodNumber - b.periodNumber);
      } else if (paymentType === 'DIA') {
        // Día-calendario de México (UTC-6). Las fechas de vencimiento están
        // ancladas a medianoche UTC = día de México, así que comparamos por
        // año-mes-día sin reanclar la cuota; solo ajustamos "hoy".
        const mxNow2 = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const hoyUTC = Date.UTC(mxNow2.getUTCFullYear(), mxNow2.getUTCMonth(), mxNow2.getUTCDate());
        targetSchedules = schedules.filter((s) => {
          const due = new Date(s.dueDate);
          const dueUTC = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
          return dueUTC === hoyUTC;
        });
        if (targetSchedules.length === 0) {
          throw new BadRequestException(
            'No hay ninguna cuota que venza hoy para este crédito. ' +
            'Usa "Por cuotas" para elegir cuáles pagar, o "Pago Total".',
          );
        }
      } else {
        targetSchedules = schedules;
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

    // Folio secuencial del día: contamos los pagos del día-calendario de México.
    // (fecha_pago se guarda en hora MX, así que el límite también va en hora MX.)
    const mxNow = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const todayStart = new Date(Date.UTC(mxNow.getUTCFullYear(), mxNow.getUTCMonth(), mxNow.getUTCDate(), 0, 0, 0, 0));
    const countResult = await this.dataSource.query(
      'SELECT COUNT(*) as cnt FROM pagos WHERE fecha_pago >= ?', [todayStart]
    );
    const seq = Number(countResult?.[0]?.cnt || 0) + 1;
    const dateStr = `${mxNow.getUTCFullYear()}${String(mxNow.getUTCMonth()+1).padStart(2,'0')}${String(mxNow.getUTCDate()).padStart(2,'0')}`;
    const receiptNumber = `REC-${dateStr}-${String(seq).padStart(4,'0')}`;

    const payment = this.paymentRepo.create({
      loanId: dto.loanId,
      collectorId: source === PaymentSource.COBRADOR ? userId : undefined,
      cashSessionId: cashSession?.id,
      amountPaid: dto.amountPaid,
      capitalApplied: this.calculator.round(capitalApplied),
      interestApplied: this.calculator.round(interestApplied),
      lateInterestApplied: this.calculator.round(lateInterestApplied),
      paymentDate: fechaPagoMx,
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
    // Los paymentDate se guardan en hora de México (UTC-6). Para "hoy en México",
    // tomamos la fecha-calendario de México y construimos medianoche en esa hora.
    const ahora = new Date();
    const mx = new Date(ahora.getTime() - 6 * 60 * 60 * 1000); // ahora en hora MX
    // Medianoche del día-calendario de México, expresada igual que paymentDate
    const today = new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), mx.getUTCDate(), 0, 0, 0, 0));
    const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return this.paymentRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.loan', 'l')
      .leftJoinAndSelect('l.customer', 'c')
      .where('p.paymentDate >= :today', { today })
      .andWhere('p.paymentDate < :tomorrow', { tomorrow })
      .orderBy('p.creado_en', 'DESC')
      .getMany();
  }

    async getPaymentsByRange(from: string, to?: string) {
    if (!from) throw new BadRequestException('Debe indicar la fecha inicial');
 
    // Inicio: medianoche del día `from`.
    const start = new Date(`${from}T00:00:00Z`);
    // Fin: medianoche del día siguiente a `to` (o de `from` si no hay `to`).
    const endDay = to ? new Date(`${to}T00:00:00Z`) : new Date(`${from}T00:00:00Z`);
    const end = new Date(endDay);
    end.setUTCDate(end.getUTCDate() + 1);
 
    if (end <= start) {
      throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
    }
 
    return this.paymentRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.loan', 'l')
      .leftJoinAndSelect('l.customer', 'c')
      .where('p.paymentDate >= :start', { start })
      .andWhere('p.paymentDate < :end', { end })
      .orderBy('p.paymentDate', 'DESC')
      .getMany();
  }

  // Pagos con geolocalización para el monitor web (mapa de cobranza)
  async getGeoPayments(date?: string) {
    // Los paymentDate están en hora de México. Construimos los límites del día
    // en hora de México para que el filtro cubra el día-calendario correcto.
    let day: Date;
    if (date) {
      // date = 'YYYY-MM-DD' (día-calendario de México). Medianoche de ese día.
      day = new Date(`${date}T00:00:00Z`);
    } else {
      const mx = new Date(Date.now() - 6 * 60 * 60 * 1000);
      day = new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), mx.getUTCDate(), 0, 0, 0, 0));
    }
    const next = new Date(day); next.setUTCDate(next.getUTCDate() + 1);
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

  async getThermalTicketData(paymentId: string) {
  const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
  if (!payment) throw new NotFoundException('Pago no encontrado');

  const loan = await this.loanRepo.findOne({
    where: { id: payment.loanId },
    relations: ['customer', 'loanType'],
  });

  const company = await this.companyService.get();

  const schedules = await this.scheduleRepo.find({
    where: { loanId: payment.loanId },
  });

  const totalCuotas = schedules.length;
  const cuotasPagadas = schedules.filter(
    s => s.status === ScheduleStatus.PAGADO,
  ).length;
  const cuotasPendientes = schedules.filter(
    s => s.status === ScheduleStatus.PENDIENTE,
  ).length;

  const saldo = this.calculator.round(
    schedules
      .filter(s => s.status !== ScheduleStatus.PAGADO)
      .reduce((sum, s) => sum + Number(s.balanceDue || 0), 0),
  );

  const stats = {
    totalCuotas,
    cuotasPagadas,
    cuotasPendientes,
    saldo,
  };

  return {
    payment,
    loan,
    company,
    stats,
  };
}

  // ── TICKET TÉRMICO 80mm ──────────────────────────────────
  // Genera el ticket de impresora térmica para un pago. Calcula las
  // estadísticas del crédito (cuotas pagadas/pendientes, saldo) leyendo
  // el calendario actual, y deja intacto el comprobante carta.
  async generateThermalTicket(paymentId: string, res: Response): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    const loan = await this.loanRepo.findOne({
      where: { id: payment.loanId }, relations: ['customer', 'loanType'],
    });
    const company = await this.companyService.get();

    // Calcular stats del crédito a partir del calendario actual
    const schedules = await this.scheduleRepo.find({
      where: { loanId: payment.loanId },
    });
    const totalCuotas      = schedules.length;
    const cuotasPagadas    = schedules.filter((s) => s.status === ScheduleStatus.PAGADO).length;
    const cuotasPendientes = schedules.filter((s) => s.status === ScheduleStatus.PENDIENTE).length;
    // Saldo = suma de balanceDue de las cuotas no pagadas
    const saldo = this.calculator.round(
      schedules
        .filter((s) => s.status !== ScheduleStatus.PAGADO)
        .reduce((sum, s) => sum + Number(s.balanceDue || 0), 0),
    );

    const stats = { totalCuotas, cuotasPagadas, cuotasPendientes, saldo };
    return this.pdfService.generateThermalReceipt({ payment, loan, company, stats }, res);
  }

async generateThermalTicketHtml(id: string, res: Response): Promise<void> {
  const data = await this.getThermalTicketData(id);

  const html = this.pdfService.generateThermalReceiptHtml(data);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
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

  // Cuotas con mora de un crédito (para la pantalla de eliminar mora)
  @Get('cuotas-con-mora/:loanId') @AuthPermission('moratorios.eliminar')
  cuotasConMora(@Param('loanId') loanId: string) {
    return this.paymentsService.getCuotasConMora(loanId);
  }

  // Eliminar la mora de una cuota PAGADA (protegido por permiso)
  @Delete('mora/cuota/:scheduleId') @AuthPermission('moratorios.eliminar')
  eliminarMora(@Param('scheduleId') scheduleId: string, @CurrentUser('id') userId: string) {
    return this.paymentsService.eliminarMoraCuota(scheduleId, userId);
  }

  @Get('today') @Auth()
  today() { return this.paymentsService.getTodayPayments(); }

  @Get('by-range') @Auth()
  byRange(@Query('from') from: string, @Query('to') to?: string) {
    return this.paymentsService.getPaymentsByRange(from, to);
  }

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

  // Ticket de impresora térmica 80mm
  @Get(':id/ticket') @Auth()
  ticket(@Param('id') id: string, @Res() res: Response) {
    return this.paymentsService.generateThermalTicket(id, res);
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
