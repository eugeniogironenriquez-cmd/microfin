import "dotenv/config";
import {
  Module,
  Controller,
  Injectable,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Res,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { TypeOrmModule, InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Response } from "express";
import {
  Loan,
  LoanType,
  PaymentSchedule,
  Customer,
  PlazoCredito,
  LoanStatus,
  ScheduleStatus,
  UserRole,
} from "../common/entities";
import {
  Auth,
  AuthPermission,
  CurrentUser,
} from "../common/guards/roles.guard";
import { PdfGeneratorService } from "../pdf-generator/pdf-generator.service";
import { PdfGeneratorModule } from "../pdf-generator/pdf-generator.module";
import { GuarantorModule } from "../guarantor/guarantor.module";
import { GuarantorService } from "../guarantor/guarantor.module";
import { CompanyModule } from "../company/company.module";
import { CompanyService } from "../company/company.module";
import {
  PlazosCreditoModule,
  PlazosCreditoService,
} from "../plazos-credito/plazos-credito.module";
import {
  ConfigMoraModule,
  ConfigMoraService,
} from "../config-mora/config-mora.module";

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
    const totalInterest = this.round(
      principal * percentage * FinancialCalculator.FACTOR,
    );
    const totalAmount = this.round(principal + totalInterest);
    const periodicPayment = this.round(totalAmount / days);
    return { totalAmount, totalInterest, periodicPayment };
  }

  // Cálculo con cuota personalizada (Opción A: la cuota manda).
  // La cuota no puede ser menor a la calculada por la fórmula.
  // El total pasa a ser cuota * días.
  calculateWithPayment(
    principal: number,
    percentage: number,
    days: number,
    customPayment?: number,
  ) {
    const base = this.calculate(principal, percentage, days);
    if (customPayment == null || Number(customPayment) <= 0) {
      return base; // sin cuota personalizada, usa el cálculo normal
    }
    const cuota = this.round(Number(customPayment));
    if (cuota < base.periodicPayment) {
      // No permitir cuota menor a la calculada
      return {
        ...base,
        error: `La cuota no puede ser menor a ${base.periodicPayment}`,
      };
    }
    const totalAmount = this.round(cuota * days);
    const totalInterest = this.round(totalAmount - principal);
    return { totalAmount, totalInterest, periodicPayment: cuota };
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
    const d = new Date(
      Date.UTC(
        mxTime.getUTCFullYear(),
        mxTime.getUTCMonth(),
        mxTime.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
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

  // ── FECHAS DE CONVENIO (periodicidad + fecha de inicio elegidas) ──
  // periodicidad: DIARIO (solo L-V) | SEMANAL | QUINCENAL | MENSUAL
  // El primer pago cae EXACTAMENTE en fechaPrimerPago; los siguientes
  // se espacian según la periodicidad. Todo anclado a medianoche UTC.
  generateConvenioDates(
    fechaPrimerPago: string,
    periodicidad: "DIARIO" | "SEMANAL" | "QUINCENAL" | "MENSUAL",
    count: number,
  ): Date[] {
    // Anclar la fecha del primer pago a medianoche UTC del día elegido
    const [year, month, day] = fechaPrimerPago.split("-").map(Number);

    const base = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
    const dates: Date[] = [];
    let cursor = new Date(base);

    for (let i = 0; i < count; i++) {
      if (i === 0) {
        // El primer pago es la fecha elegida; si es DIARIO y cae en fin de
        // semana, lo movemos al siguiente día hábil
        if (periodicidad === "DIARIO" && this.isWeekend(cursor)) {
          cursor = this.nextBusinessDay(cursor);
        }
        dates.push(new Date(cursor));
        continue;
      }

      if (periodicidad === "DIARIO") {
        cursor = this.nextBusinessDay(cursor); // siguiente L-V
      } else if (periodicidad === "SEMANAL") {
        cursor = new Date(cursor);
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      } else if (periodicidad === "QUINCENAL") {
        cursor = new Date(cursor);
        cursor.setUTCDate(cursor.getUTCDate() + 15);
      } else {
        // MENSUAL
        cursor = new Date(cursor);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
      dates.push(new Date(cursor));
    }
    return dates;
  }

  // ── TABLA DE AMORTIZACIÓN (calendario L-V) ───────────────────
  // days = número de pagos (un pago por día hábil)
  generateScheduleTable(
    principal: number,
    percentage: number,
    days: number,
    startDate: Date,
    customPayment?: number,
    fechaPrimerPago?: string, // "YYYY-MM-DD": si viene, el 1er pago cae ese día
  ) {
    const calc = this.calculateWithPayment(
      principal,
      percentage,
      days,
      customPayment,
    );
    const totalAmount = calc.totalAmount;
    const periodicPayment = calc.periodicPayment;
    const interestTotal = this.round(totalAmount - principal);
    const interestPerPeriod = this.round(interestTotal / days);
    const capitalPerPeriod = this.round(principal / days);

    // Si se indicó una fecha de primer pago, el calendario arranca EXACTAMENTE
    // ese día (parseando por partes año-mes-día para no correr el día por UTC).
    // Si no, se usa el comportamiento normal (primer día hábil tras startDate).
    const dates = fechaPrimerPago
      ? this.generateConvenioDates(fechaPrimerPago, "DIARIO", days)
      : this.generateBusinessDates(startDate, days);
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

  round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}

// ── LOANS SERVICE ─────────────────────────────────────────────
@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(LoanType) private loanTypeRepo: Repository<LoanType>,
    @InjectRepository(PaymentSchedule)
    private scheduleRepo: Repository<PaymentSchedule>,
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    private calculator: FinancialCalculator,
    private dataSource: DataSource,
    private pdfService: PdfGeneratorService,
    private guarantorService: GuarantorService,
    private companyService: CompanyService,
    private plazosService: PlazosCreditoService,
    private configMoraService: ConfigMoraService,
  ) {}

  async findAll(filters: {
    page?: number;
    limit?: number;
    status?: string;
    customerId?: string;
    search?: string;
    asignacion?: string;
  }) {
    const { page = 1, limit = 20 } = filters;
    const qb = this.loanRepo
      .createQueryBuilder("l")
      .leftJoinAndSelect("l.customer", "c")
      .leftJoinAndSelect("l.loanType", "lt")
      // Join manual con usuarios para traer el nombre del cobrador asignado.
      // Se usa un alias explícito (collector_name) para leerlo del raw sin ambigüedad.
      .leftJoin("usuarios", "col", "col.id = l.cobrador_id")
      .addSelect("col.nombre", "collector_name")
      .orderBy("l.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.status)
      qb.andWhere("l.status = :status", { status: filters.status });
    if (filters.customerId)
      qb.andWhere("l.customerId = :cid", { cid: filters.customerId });
    // Filtro por estado de asignación: 'sin_asignar' o 'asignados'.
    if ((filters as any).asignacion === "sin_asignar")
      qb.andWhere("l.cobrador_id IS NULL");
    if ((filters as any).asignacion === "asignados")
      qb.andWhere("l.cobrador_id IS NOT NULL");
    if (filters.search) {
      qb.andWhere("(c.fullName LIKE :s OR c.phone LIKE :s)", {
        s: `%${filters.search}%`,
      });
    }
    const [rawResult, total] = await Promise.all([
      qb.getRawAndEntities(),
      qb.getCount(),
    ]);
    // Adjuntar el nombre del cobrador a cada crédito. Se mapea por el id del
    // préstamo (l_id en el raw) en vez de por índice, para evitar desalineación.
    const rawPorId = new Map<string, any>();
    for (const raw of rawResult.raw) {
      const loanId = raw?.l_id ?? raw?.l_ID;
      if (loanId != null) rawPorId.set(String(loanId), raw);
    }
    const data = rawResult.entities.map((loan: any) => {
      const raw = rawPorId.get(String(loan.id));
      return {
        ...loan,
        collectorName: raw?.collector_name || null,
      };
    });
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Loan> {
    const loan = await this.loanRepo.findOne({
      where: { id },
      relations: ["customer", "loanType", "paymentSchedules", "payments"],
    });
    if (!loan) throw new NotFoundException("Préstamo no encontrado");
    return loan;
  }

  // ── CORREGIR MONTO (carga manual errónea) ────────────────────
  // Corrige SOLO principalAmount y totalAmount. NO regenera el calendario,
  // NO recalcula pago_periodico ni cuotas. Uso: enmendar montos capturados
  // mal en cargas manuales. Devuelve el préstamo con relaciones para refrescar
  // la vista de detalle.
  async updateMonto(
    id: string,
    dto: { principalAmount: number; totalAmount: number },
  ) {
    const principal = Number(dto.principalAmount);
    const total = Number(dto.totalAmount);

    if (!principal || principal <= 0)
      throw new BadRequestException("Monto principal inválido");
    if (!total || total <= 0)
      throw new BadRequestException("Total a pagar inválido");
    if (total < principal)
      throw new BadRequestException(
        "El total a pagar no puede ser menor al monto principal",
      );

    const loan = await this.loanRepo.findOne({ where: { id } });
    if (!loan) throw new NotFoundException("Préstamo no encontrado");

    // Corrección directa. Intencionalmente NO se toca el calendario ni la cuota.
    loan.principalAmount = principal;
    loan.totalAmount = total;
    await this.loanRepo.save(loan);

    // Devolver con relaciones para que el front repinte igual que findOne.
    return this.findOne(id);
  }

  // ── SIMULAR ──────────────────────────────────────────────────
  // days = plazo en días (determina el % automáticamente)
  async simulate(dto: {
    principalAmount: number;
    termWeeks: number;
    frequency?: string;
    days?: number;
    percentage?: number;
    customPayment?: number;
    esReestructura?: boolean;
  }) {
    const principal = Number(dto.principalAmount);
    const days = Number(dto.days ?? dto.termWeeks);
    // En una reestructura, el monto ya incluye el interés del crédito original,
    // así que no se aplica el factor: el porcentaje es 0 (cuota = monto / plazo).
    const percentage = dto.esReestructura
      ? 0
      : dto.percentage != null
        ? Number(dto.percentage)
        : await this.plazosService.getPercentageForDays(days);

    const calc = this.calculator.calculateWithPayment(
      principal,
      percentage,
      days,
      dto.customPayment,
    );
    if ((calc as any).error) throw new BadRequestException((calc as any).error);

    const table = this.calculator.generateScheduleTable(
      principal,
      percentage,
      days,
      new Date(),
      dto.customPayment,
    );
    return {
      periodicPayment: calc.periodicPayment,
      totalPayment: calc.totalAmount,
      totalInterest: calc.totalInterest,
      minPayment: this.calculator.calculate(principal, percentage, days)
        .periodicPayment,
      percentage,
      days,
      schedule: table,
    };
  }

  async create(
    dto: any & { customerId: string },
    userId: string,
  ): Promise<Loan> {
    // VALIDACIÓN: un cliente solo puede tener un crédito vigente a la vez.
    // Bloquean los estados "vivos": SOLICITUD, AUTORIZADO, ACTIVO, VENCIDO.
    // No bloquean LIQUIDADO/RECHAZADO (terminados) ni REESTRUCTURADO/CONVENIO
    // (históricos; el crédito vivo es el hijo, que estará ACTIVO/VENCIDO).
    const estadosBloqueantes = [
      LoanStatus.SOLICITUD,
      LoanStatus.AUTORIZADO,
      LoanStatus.ACTIVO,
      LoanStatus.ATRASADO,
      LoanStatus.VENCIDO,
    ];
    const existente = await this.loanRepo.findOne({
      where: estadosBloqueantes.map((status) => ({
        customerId: dto.customerId,
        status,
      })),
    });
    if (existente) {
      throw new BadRequestException(
        `El cliente ya tiene un crédito vigente (estado: ${existente.status}). ` +
          `No se puede crear uno nuevo hasta que el actual sea liquidado.`,
      );
    }

    const principal = Number(dto.principalAmount);
    const days = Number(dto.days ?? dto.termWeeks);
    // Resolver % por el plazo configurado
    const percentage = await this.plazosService.getPercentageForDays(days);

    const calc = this.calculator.calculateWithPayment(
      principal,
      percentage,
      days,
      dto.customPayment,
    );
    if ((calc as any).error) throw new BadRequestException((calc as any).error);

    const loan = this.loanRepo.create({
      ...dto,
      termWeeks: days,
      frequency: "DIARIO",
      interestRate: percentage,
      totalRate: percentage,
      periodicPayment: this.calculator.round(calc.periodicPayment),
      totalAmount: this.calculator.round(calc.totalAmount),
      createdBy: userId,
    } as any);
    return this.loanRepo.save(loan as any);
  }

  // ── CARGA MANUAL DE CRÉDITO ACTUAL ───────────────────────────
  // Crea un crédito que YA existe en la calle: nace ACTIVO, genera el
  // calendario, marca las cuotas ya pagadas (periodos marcados, pueden saltar
  // días), estampa la mora inicial en cuotas vencidas y crea el aval.
  // El frontend calcula las fechas del calendario y las envía aquí (cada cuota
  // con su fecha), para que coincidan exactamente con lo que el usuario vio.
  async cargaManual(
    dto: {
      customerId: string;
      principalAmount: number;
      days: number;
      periodicPayment: number; // cuota editable
      disbursedAt?: string; // yyyy-mm-dd
      firstPaymentDate: string; // yyyy-mm-dd
      // Calendario calculado en el frontend: una entrada por cuota
      schedule: Array<{ period: number; dueDate: string }>;
      periodosPagados: number[]; // qué cuotas ya pagó (pueden saltar días)
      fechaUltimoPago?: string; // yyyy-mm-dd (paidAt de la última pagada)
      totalMoratorio?: number; // mora que arrastra del sistema anterior
      aval?: {
        // datos del aval (opcional)
        fullName?: string;
        curp?: string;
        rfc?: string;
        phone?: string;
        relationship?: string;
        address?: string;
      };
      notes?: string;
    },
    userId: string,
  ) {
    // VALIDACIÓN: un crédito vigente por cliente (igual que create)
    const estadosBloqueantes = [
      LoanStatus.SOLICITUD,
      LoanStatus.AUTORIZADO,
      LoanStatus.ACTIVO,
      LoanStatus.ATRASADO,
      LoanStatus.VENCIDO,
    ];
    const existente = await this.loanRepo.findOne({
      where: estadosBloqueantes.map((status) => ({
        customerId: dto.customerId,
        status,
      })),
    });
    if (existente) {
      throw new BadRequestException(
        `El cliente ya tiene un crédito vigente (estado: ${existente.status}). ` +
          `No se puede cargar otro hasta que el actual sea liquidado.`,
      );
    }

    const principal = Number(dto.principalAmount);
    const days = Math.round(Number(dto.days));
    const cuota = this.calculator.round(Number(dto.periodicPayment));
    const pagados = Array.isArray(dto.periodosPagados)
      ? dto.periodosPagados.map(Number)
      : [];
    const totalMoratorio = Number(dto.totalMoratorio) || 0;

    if (!principal || principal <= 0)
      throw new BadRequestException("Monto inválido");
    if (!days || days <= 0) throw new BadRequestException("Plazo inválido");
    if (!cuota || cuota <= 0) throw new BadRequestException("Cuota inválida");
    if (!Array.isArray(dto.schedule) || dto.schedule.length !== days)
      throw new BadRequestException(
        "El calendario no coincide con el número de días",
      );

    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId },
    });
    if (!customer) throw new NotFoundException("Cliente no encontrado");

    const total = this.calculator.round(cuota * days);
    const capitalPorCuota = this.calculator.round(principal / days);
    const moraPorDia = totalMoratorio; // se distribuye abajo; usamos el total directo
    const hoy = this.calculator.anchorToMexicoDay(new Date());

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let savedLoanId = "";

    try {
      // Crear el crédito (nace ACTIVO; si tiene vencidas, lo ajustamos a VENCIDO al final)
      const loan = this.loanRepo.create({
        customerId: dto.customerId,
        principalAmount: principal,
        interestRate: 0,
        totalRate: 0,
        termWeeks: days,
        frequency: "DIARIO",
        status: LoanStatus.ACTIVO,
        disbursedAt: dto.disbursedAt
          ? new Date(`${dto.disbursedAt}T00:00:00Z`)
          : new Date(`${dto.firstPaymentDate}T00:00:00Z`),
        disbursedBy: userId,
        disbursementMethod: "CARGA_MANUAL",
        periodicPayment: cuota,
        totalAmount: total,
        notes: dto.notes || "Crédito cargado manualmente (sistema anterior)",
        createdBy: userId,
      } as any);
      const saved: Loan = await qr.manager.save(loan as any);
      savedLoanId = saved.id;

      // Generar el calendario con las fechas que envió el frontend
      const pagadosSet = new Set(pagados);
      const fUltimo = dto.fechaUltimoPago
        ? new Date(`${dto.fechaUltimoPago}T00:00:00Z`)
        : null;
      // El número de cuota pagada más alto (para asignarle la fecha de último pago)
      const ultimoPeriodoPagado = pagados.length > 0 ? Math.max(...pagados) : 0;

      let balance = total;
      const schedules: PaymentSchedule[] = [];
      for (let i = 1; i <= days; i++) {
        const pmt = i < days ? cuota : this.calculator.round(balance);
        balance = this.calculator.round(Math.max(0, balance - pmt));
        const pagada = pagadosSet.has(i);
        const fechaCuota = new Date(`${dto.schedule[i - 1].dueDate}T00:00:00Z`);
        // paidAt: si es la última pagada y hay fecha de último pago, úsala; si no, su fecha
        const paidAt = pagada
          ? i === ultimoPeriodoPagado && fUltimo
            ? fUltimo
            : fechaCuota
          : null;
        schedules.push(
          this.scheduleRepo.create({
            loanId: saved.id,
            periodNumber: i,
            dueDate: fechaCuota,
            principalDue: capitalPorCuota,
            interestDue: 0,
            totalDue: pmt,
            balanceDue: pagada ? 0 : pmt,
            lateInterest: 0,
            moraGenerada: 0,
            moraPagada: 0,
            status: pagada ? ScheduleStatus.PAGADO : ScheduleStatus.PENDIENTE,
            paidAt,
          }) as PaymentSchedule,
        );
      }

      // Estampar la mora inicial distribuida en cuotas pendientes ya vencidas
      if (totalMoratorio > 0) {
        const vencidasPendientes = schedules.filter(
          (s) => s.status !== ScheduleStatus.PAGADO && s.dueDate < hoy,
        );
        if (vencidasPendientes.length > 0) {
          // Repartir el total entre las vencidas; la última absorbe el resto
          const base = this.calculator.round(
            totalMoratorio / vencidasPendientes.length,
          );
          let acum = 0;
          vencidasPendientes.forEach((s, k) => {
            const esUltima = k === vencidasPendientes.length - 1;
            const m = esUltima
              ? this.calculator.round(totalMoratorio - acum)
              : base;
            s.moraGenerada = m;
            acum = this.calculator.round(acum + m);
          });
        } else {
          // Sin vencidas: estampar todo en la primera pendiente
          const primera = schedules.find(
            (s) => s.status !== ScheduleStatus.PAGADO,
          );
          if (primera)
            primera.moraGenerada = this.calculator.round(totalMoratorio);
        }
      }

      await qr.manager.save(schedules);

      // Estado inicial según situación:
      //  - VENCIDO  si hay cuotas vencidas y NO quedan cuotas futuras (plazo terminado)
      //  - ATRASADO si hay cuotas vencidas pero aún quedan futuras (plazo vigente)
      //  - ACTIVO   si no hay vencidas
      const pendientes = schedules.filter(
        (s) => s.status !== ScheduleStatus.PAGADO,
      );
      const tieneVencidas = pendientes.some((s) => s.dueDate < hoy);
      const tieneFuturas = pendientes.some((s) => s.dueDate >= hoy);
      if (tieneVencidas) {
        const nuevoEstado = tieneFuturas
          ? LoanStatus.ATRASADO
          : LoanStatus.VENCIDO;
        await qr.manager.update(Loan, saved.id, { status: nuevoEstado });
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // Crear el aval fuera de la transacción (usa el servicio con su validación)
    const aval = dto.aval;
    if (savedLoanId && aval && aval.fullName && aval.curp) {
      try {
        await this.guarantorService.upsert(
          savedLoanId,
          {
            fullName: aval.fullName,
            curp: (aval.curp || "").toUpperCase(),
            rfc: (aval.rfc || "").toUpperCase() || undefined,
            phone: aval.phone || undefined,
            relationship: aval.relationship || undefined,
            address: aval.address || undefined,
          } as any,
          userId,
        );
      } catch {
        // No abortar el crédito por un fallo de aval; el crédito ya se creó
      }
    }

    const result = await this.loanRepo.findOne({ where: { id: savedLoanId } });
    return { loan: result, message: "Crédito cargado correctamente." };
  }

  async authorize(
    id: string,
    decision: "APPROVE" | "REJECT",
    userId: string,
    rejectionReason?: string,
  ): Promise<Loan> {
    const loan = await this.findOne(id);
    if (loan.status !== LoanStatus.SOLICITUD)
      throw new BadRequestException(
        "Solo se pueden autorizar préstamos en estatus SOLICITUD",
      );
    loan.status =
      decision === "APPROVE" ? LoanStatus.AUTORIZADO : LoanStatus.RECHAZADO;
    loan.authorizedBy = userId;
    loan.authorizedAt = new Date();
    if (rejectionReason) loan.rejectionReason = rejectionReason;
    return this.loanRepo.save(loan);
  }

  // ── DESEMBOLSAR (genera calendario L-V) ──────────────────────
  async disburse(
    id: string,
    dto: { disbursementMethod: string; notes?: string },
    userId: string,
  ) {
    const loan = await this.findOne(id);
    if (loan.status !== LoanStatus.AUTORIZADO)
      throw new BadRequestException(
        "El préstamo no está autorizado para desembolso",
      );

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      loan.status = LoanStatus.ACTIVO;
      loan.disbursedAt = new Date();
      loan.disbursementMethod = dto.disbursementMethod;
      loan.disbursedBy = userId;
      if (dto.notes) loan.notes = dto.notes;
      await qr.manager.save(loan);

      const days = Math.round(loan.termWeeks);
      const percentage = Number((loan as any).totalRate || loan.interestRate);
      // Usamos la cuota guardada del crédito (puede venir ajustada por el usuario)
      const cuotaGuardada = Number(loan.periodicPayment);

      // Calendario L-V empezando el día hábil siguiente al desembolso
      const table = this.calculator.generateScheduleTable(
        Number(loan.principalAmount),
        percentage,
        days,
        loan.disbursedAt,
        cuotaGuardada,
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
      return { loan, schedulesGenerated: schedules.length };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── REESTRUCTURAR ────────────────────────────────────────────
  async restructure(id: string, dto: any, userId: string) {
    const loan = await this.findOne(id);
    if (
      !["ACTIVO", "ATRASADO", "VENCIDO", "REESTRUCTURADO"].includes(loan.status)
    )
      throw new BadRequestException(
        "Solo se pueden reestructurar créditos ACTIVO, ATRASADO o VENCIDO",
      );

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      loan.status = LoanStatus.REESTRUCTURADO;
      await qr.manager.save(loan);

      const principal = Number(dto.principalAmount);
      const days = Number(dto.days ?? dto.termWeeks);

      // En una REESTRUCTURA, el monto que se captura ya es el saldo a
      // reestructurar (ya incluye el interés y factor del crédito original).
      // Por eso NO se vuelve a aplicar el factor ni el interés: el total a
      // pagar es el propio monto, y la cuota es monto / plazo.
      const totalAmount = this.calculator.round(principal);
      const cuotaAutomatica = this.calculator.round(totalAmount / days);

      let periodicPayment = cuotaAutomatica;
      if (dto.customPayment != null && Number(dto.customPayment) > 0) {
        const cuota = this.calculator.round(Number(dto.customPayment));
        // La cuota personalizada no puede ser menor a la automática, porque
        // no alcanzaría a cubrir el saldo en el plazo indicado.
        if (cuota < cuotaAutomatica) {
          throw new BadRequestException(
            `La cuota no puede ser menor a ${cuotaAutomatica}`,
          );
        }
        periodicPayment = cuota;
      }
      // El porcentaje se guarda solo como referencia (0 en reestructura, ya que
      // el interés no se recalcula).
      const percentage = 0;

      const newLoan = this.loanRepo.create({
        customerId: loan.customerId,
        loanTypeId: dto.loanTypeId || loan.loanTypeId,
        parentLoanId: loan.id,
        principalAmount: principal,
        interestRate: percentage,
        totalRate: percentage,
        termWeeks: days,
        frequency: "DIARIO",
        status: LoanStatus.ACTIVO,
        disbursedAt: new Date(),
        disbursedBy: userId,
        disbursementMethod: "REESTRUCTURA",
        periodicPayment: this.calculator.round(periodicPayment),
        totalAmount: this.calculator.round(totalAmount),
        restructureCount: (loan.restructureCount || 0) + 1,
        restructureReason: dto.restructureReason,
        createdBy: userId,
      } as any);
      const saved = await qr.manager.save(newLoan as any);

      const table = this.calculator.generateScheduleTable(
        principal,
        percentage, // 0 en reestructura: el monto ya es el total, sin interés
        days,
        new Date(),
        periodicPayment > cuotaAutomatica ? periodicPayment : undefined,
        dto.fechaPrimerPago || undefined, // el calendario inicia ese día
      );
      const schedules = table.map((row: any) =>
        this.scheduleRepo.create({
          loanId: saved.id,
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
      return { loan: saved, schedulesGenerated: schedules.length };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getSchedule(loanId: string): Promise<any[]> {
    const schedules = await this.scheduleRepo.find({
      where: { loanId },
      order: { periodNumber: "ASC" },
    });

    // Observaciones del cobrador: la tabla pagos guarda `notas` y el JSON
    // `cuotas_pagadas` con los periodos que cubrió cada pago. Se cruzan aquí
    // para mostrar la nota en la(s) cuota(s) correspondiente(s) del calendario.
    const pagosConNotas = await this.dataSource.query(
      `SELECT notas, cuotas_pagadas
         FROM pagos
        WHERE prestamo_id = ?
          AND notas IS NOT NULL AND notas <> ''
        ORDER BY creado_en ASC`,
      [loanId],
    );

    const notasPorPeriodo = new Map<number, string[]>();
    for (const p of pagosConNotas) {
      if (!p.cuotas_pagadas) continue;
      try {
        const arr = JSON.parse(p.cuotas_pagadas);
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
          const periodo = Number(item?.periodo ?? item);
          if (isNaN(periodo)) continue;
          if (!notasPorPeriodo.has(periodo)) notasPorPeriodo.set(periodo, []);
          const lista = notasPorPeriodo.get(periodo)!;
          // Evitar repetir la misma nota si el pago cubrió varias cuotas ya listadas.
          if (!lista.includes(p.notas)) lista.push(p.notas);
        }
      } catch {
        // JSON inválido en cuotas_pagadas: se ignora ese pago.
      }
    }

    return schedules.map((s) => ({
      ...s,
      // Varias notas en la misma cuota se unen con " | ".
      notas: (notasPorPeriodo.get(s.periodNumber) || []).join(" | ") || null,
    }));
  }

  // ── PRÓXIMOS A LIQUIDAR (feature 11) ─────────────────────────
  // Créditos ACTIVO/VENCIDO con 3 o menos cuotas pendientes.
  // Lista informativa para el administrador.
  async getProximosLiquidar(maxPendientes = 3) {
    const loans = await this.loanRepo.find({
      where: [
        { status: LoanStatus.ACTIVO },
        { status: LoanStatus.ATRASADO },
        { status: LoanStatus.VENCIDO },
      ],
      relations: ["customer"],
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
          customerName: loan.customer?.fullName || "",
          customerPhone: loan.customer?.phone || "",
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

  // ── RENOVACIÓN (feature 7) ───────────────────────────────────
  // Crea un nuevo crédito que NACE AUTORIZADO a partir de un crédito liquidado.
  // Aval: opcional. avalMode = 'NINGUNO' | 'REUSAR' | 'NUEVO'.
  async renovar(
    prevLoanId: string,
    dto: {
      principalAmount: number;
      days: number;
      loanTypeId?: string;
      avalMode?: "NINGUNO" | "REUSAR" | "NUEVO";
      aval?: any; // datos del aval nuevo si avalMode === 'NUEVO'
      notes?: string;
      customPayment?: number; // cuota diaria ajustada por el usuario
    },
    userId: string,
  ) {
    const prev = await this.loanRepo.findOne({ where: { id: prevLoanId } });
    if (!prev) throw new NotFoundException("Crédito de origen no encontrado");

    // Se puede renovar si el crédito está LIQUIDADO, o si le quedan 3 o menos
    // cuotas pendientes (renovación anticipada para buen cliente). En este
    // último caso, el saldo pendiente se liquida con la renovación: se descuenta
    // del monto que recibe el cliente y el crédito anterior queda LIQUIDADO.
    const schedulesPrev = await this.scheduleRepo.find({
      where: { loanId: prev.id },
    });
    const cuotasPendientes = schedulesPrev.filter(
      (s) => s.status !== ScheduleStatus.PAGADO,
    );
    // Saldo de capital+interés pendiente (campo saldo_adeudado).
    const saldoCapitalPrev = this.calculator.round(
      cuotasPendientes.reduce((sum, s) => sum + Number(s.balanceDue || 0), 0),
    );
    // Mora pendiente = mora generada − mora pagada, de TODAS las cuotas
    // (la mora puede existir en cuotas que ya no están pendientes de capital).
    const moraPendientePrev = this.calculator.round(
      schedulesPrev.reduce(
        (sum, s) =>
          sum +
          Math.max(0, Number(s.moraGenerada || 0) - Number(s.moraPagada || 0)),
        0,
      ),
    );
    // El saldo total a liquidar con la renovación = capital+interés + mora.
    const saldoPendientePrev = this.calculator.round(
      saldoCapitalPrev + moraPendientePrev,
    );

    const estaLiquidado = prev.status === LoanStatus.LIQUIDADO;
    const porTerminar =
      cuotasPendientes.length > 0 && cuotasPendientes.length <= 3;

    if (!estaLiquidado && !porTerminar) {
      throw new BadRequestException(
        "Solo se puede renovar un crédito liquidado o con 3 o menos cuotas pendientes",
      );
    }

    const principal = Number(dto.principalAmount);
    const days = Number(dto.days);

    // Si se liquida saldo anterior, el monto solicitado debe cubrirlo.
    const saldoALiquidar = estaLiquidado ? 0 : saldoPendientePrev;
    if (saldoALiquidar > 0 && principal <= saldoALiquidar) {
      throw new BadRequestException(
        `El monto de la renovación ($${principal.toFixed(2)}) debe ser mayor al saldo pendiente que se liquida ($${saldoALiquidar.toFixed(2)}).`,
      );
    }

    const percentage = await this.plazosService.getPercentageForDays(days);
    // Si el usuario ajustó la cuota diaria, se respeta (no puede ser menor a la
    // calculada por la fórmula). Si no, se usa el cálculo automático.
    const calc = this.calculator.calculateWithPayment(
      principal,
      percentage,
      days,
      dto.customPayment,
    );
    if ((calc as any).error) {
      throw new BadRequestException((calc as any).error);
    }
    const { totalAmount, periodicPayment } = calc;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Si el crédito anterior aún tenía saldo (capital+interés o mora), se
      // liquida con la renovación: las cuotas pendientes se marcan PAGADO, la
      // mora pendiente se da por saldada, y el crédito pasa a LIQUIDADO. Todo
      // ese saldo se descuenta del desembolso al cliente.
      if (!estaLiquidado && saldoPendientePrev > 0) {
        // Saldar capital+interés de las cuotas pendientes.
        for (const s of cuotasPendientes) {
          s.balanceDue = 0;
          s.status = ScheduleStatus.PAGADO;
          s.paidAt = new Date();
        }
        // Saldar la mora pendiente en TODAS las cuotas (puede haber mora en
        // cuotas cuyo capital ya estaba pagado).
        for (const s of schedulesPrev) {
          const moraPend =
            Number(s.moraGenerada || 0) - Number(s.moraPagada || 0);
          if (moraPend > 0) {
            s.moraPagada = Number(s.moraGenerada || 0);
            await qr.manager.save(s);
          } else if (cuotasPendientes.includes(s)) {
            await qr.manager.save(s);
          }
        }
        prev.status = LoanStatus.LIQUIDADO;
        await qr.manager.save(prev);
      }

      // Monto neto que recibe el cliente = principal solicitado menos el saldo
      // que se liquidó del crédito anterior.
      const saldoLiquidado = saldoALiquidar;
      const montoEntregado = this.calculator.round(principal - saldoLiquidado);

      // Crédito nuevo NACE AUTORIZADO (listo para desembolsar)
      const newLoan = this.loanRepo.create({
        customerId: prev.customerId,
        loanTypeId: dto.loanTypeId || prev.loanTypeId,
        parentLoanId: prev.id,
        principalAmount: principal,
        interestRate: percentage,
        totalRate: percentage,
        termWeeks: days,
        frequency: "DIARIO",
        status: LoanStatus.AUTORIZADO,
        authorizedBy: userId,
        authorizedAt: new Date(),
        periodicPayment: this.calculator.round(periodicPayment),
        totalAmount: this.calculator.round(totalAmount),
        // Se deja constancia del descuento en las notas para el desembolso.
        notes:
          saldoLiquidado > 0
            ? `${dto.notes ? dto.notes + " | " : ""}Renovación: se liquidó saldo anterior de $${saldoLiquidado.toFixed(2)} (capital+interés $${saldoCapitalPrev.toFixed(2)}, mora $${moraPendientePrev.toFixed(2)}). Monto entregado al cliente: $${montoEntregado.toFixed(2)}.`
            : dto.notes,
        createdBy: userId,
      } as any);
      const saved: Loan = await qr.manager.save(newLoan as any);

      await qr.commitTransaction();

      // Aval (fuera de la transacción del préstamo, usa el servicio con su validación)
      const avalMode = dto.avalMode || "NINGUNO";
      if (avalMode === "REUSAR") {
        const prevAval = await this.guarantorService.findByLoan(prev.id);
        if (prevAval) {
          await this.guarantorService.upsert(
            saved.id,
            {
              fullName: prevAval.fullName,
              curp: prevAval.curp,
              rfc: prevAval.rfc,
              phone: prevAval.phone,
              email: prevAval.email,
              address: prevAval.address,
              relationship: prevAval.relationship,
              occupation: prevAval.occupation,
            } as any,
            userId,
          );
        }
      } else if (avalMode === "NUEVO" && dto.aval) {
        await this.guarantorService.upsert(saved.id, dto.aval, userId);
      }

      return {
        loan: saved,
        saldoLiquidado,
        saldoCapital: saldoCapitalPrev,
        moraLiquidada: moraPendientePrev,
        montoEntregado: this.calculator.round(principal - saldoLiquidado),
        message:
          saldoLiquidado > 0
            ? `Renovación creada. Se liquidó el saldo anterior de $${saldoLiquidado.toFixed(2)} (incluye mora $${moraPendientePrev.toFixed(2)}); el cliente recibe $${this.calculator.round(principal - saldoLiquidado).toFixed(2)}.`
            : "Renovación creada y autorizada. Lista para desembolsar.",
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // Datos para la pantalla de renovación: historial de pago del crédito anterior
  async getRenovacionInfo(prevLoanId: string) {
    const prev = await this.loanRepo.findOne({
      where: { id: prevLoanId },
      relations: ["customer"],
    });
    if (!prev) throw new NotFoundException("Crédito no encontrado");

    const payments = await this.scheduleRepo.find({
      where: { loanId: prevLoanId },
    });
    const totalCuotas = payments.length;
    const pagadas = payments.filter(
      (s) => s.status === ScheduleStatus.PAGADO,
    ).length;
    // Cuotas y saldo aún pendientes: si el crédito no está liquidado, este
    // saldo se descontará del monto de la renovación.
    const pendientes = payments.filter(
      (s) => s.status !== ScheduleStatus.PAGADO,
    );
    // Saldo de capital+interés pendiente.
    const saldoCapital = this.calculator.round(
      pendientes.reduce((sum, s) => sum + Number(s.balanceDue || 0), 0),
    );
    // Mora pendiente = mora generada − mora pagada (de todas las cuotas).
    const moraPendiente = this.calculator.round(
      payments.reduce(
        (sum, s) =>
          sum +
          Math.max(0, Number(s.moraGenerada || 0) - Number(s.moraPagada || 0)),
        0,
      ),
    );
    // Saldo total a liquidar con la renovación = capital+interés + mora.
    const saldoPendiente = this.calculator.round(saldoCapital + moraPendiente);
    const prevAval = await this.guarantorService.findByLoan(prevLoanId);

    return {
      prevLoan: {
        id: prev.id,
        principalAmount: Number(prev.principalAmount),
        totalAmount: Number(prev.totalAmount),
        termWeeks: prev.termWeeks,
        status: prev.status,
        disbursedAt: prev.disbursedAt,
        cuotasPendientes: pendientes.length,
        saldoCapital,
        moraPendiente,
        saldoPendiente,
      },
      customer: {
        id: prev.customerId,
        fullName: prev.customer?.fullName,
        phone: prev.customer?.phone,
        curp: prev.customer?.curp,
      },
      historialPago: { totalCuotas, pagadas },
      avalAnterior: prevAval
        ? {
            fullName: prevAval.fullName,
            curp: prevAval.curp,
            phone: prevAval.phone,
            relationship: prevAval.relationship,
          }
        : null,
    };
  }

  // ── CONVENIO DE PAGO (feature 12) ────────────────────────────
  // Reestructura un crédito existente con un plan ESPECIAL SIN INTERESES.
  // El gestor define monto total y número de pagos; se reparte en partes
  // iguales en días hábiles consecutivos. El crédito anterior pasa a CONVENIO.
  async convenio(
    loanId: string,
    dto: {
      montoConvenio: number;
      numeroPagos: number;
      periodicidad?: "DIARIO" | "SEMANAL" | "QUINCENAL" | "MENSUAL";
      fechaPrimerPago?: string; // ISO yyyy-mm-dd
      customPayment?: number; // cuota fija opcional; el último pago absorbe el resto
      notes?: string;
    },
    userId: string,
  ) {
    const prev = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!prev) throw new NotFoundException("Crédito no encontrado");
    if (
      ![LoanStatus.ACTIVO, LoanStatus.ATRASADO, LoanStatus.VENCIDO].includes(
        prev.status as LoanStatus,
      )
    )
      throw new BadRequestException(
        "Solo se puede hacer convenio de un crédito activo, atrasado o vencido",
      );

    const monto = Number(dto.montoConvenio);
    const numPagos = Math.round(Number(dto.numeroPagos));
    const periodicidad = dto.periodicidad || "SEMANAL";
    if (monto <= 0)
      throw new BadRequestException("El monto del convenio debe ser mayor a 0");
    if (numPagos <= 0)
      throw new BadRequestException("El número de pagos debe ser mayor a 0");
    if (!dto.fechaPrimerPago)
      throw new BadRequestException("Debe indicar la fecha del primer pago");

    // Cuota: si el gestor fija una cuota (customPayment), esa se usa en todos
    // los pagos salvo el último, que absorbe la diferencia (puede quedar menor
    // o mayor). Si no la fija, se reparte parejo (monto / numPagos).
    const customPayment =
      dto.customPayment != null ? Number(dto.customPayment) : 0;
    let cuota: number;
    if (customPayment > 0) {
      cuota = this.calculator.round(customPayment);
      // La cuota fija no puede ser tan baja que ni en (numPagos) pagos cubra el
      // monto dejando el último en negativo o cero antes del final.
      if (cuota * (numPagos - 1) >= monto && numPagos > 1) {
        throw new BadRequestException(
          `Con una cuota de $${cuota} y ${numPagos} pagos, la deuda se cubre antes del último pago. ` +
            `Reduce la cuota o el número de pagos.`,
        );
      }
    } else {
      cuota = this.calculator.round(monto / numPagos);
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // El crédito anterior pasa a CONVENIO (se archiva como historial)
      prev.status = LoanStatus.CONVENIO;
      await qr.manager.save(prev);

      // Nuevo crédito tipo convenio: sin intereses, nace ACTIVO
      const convenioLoan = this.loanRepo.create({
        customerId: prev.customerId,
        loanTypeId: prev.loanTypeId,
        parentLoanId: prev.id,
        principalAmount: monto,
        interestRate: 0,
        totalRate: 0,
        termWeeks: numPagos,
        // Guardar la periodicidad REAL elegida (antes se fijaba 'DIARIO'),
        // para que el documento de convenio muestre "semanales/quincenales/...".
        frequency: periodicidad,
        status: LoanStatus.ACTIVO,
        disbursedAt: new Date(),
        disbursedBy: userId,
        disbursementMethod: "CONVENIO",
        periodicPayment: cuota,
        totalAmount: this.calculator.round(monto),
        restructureReason: dto.notes || "Convenio de pago",
        isConvenio: true,
        createdBy: userId,
      } as any);
      const saved: Loan = await qr.manager.save(convenioLoan as any);

      // Calendario del convenio: fechas según periodicidad y primer pago elegidos
      const dates = this.calculator.generateConvenioDates(
        dto.fechaPrimerPago!,
        periodicidad,
        numPagos,
      );
      let balance = monto;
      const schedules = [];
      for (let i = 1; i <= numPagos; i++) {
        // Cuota fija en todos los pagos salvo el último, que absorbe el balance.
        const pmt = i < numPagos ? cuota : this.calculator.round(balance);
        balance = this.calculator.round(Math.max(0, balance - pmt));
        schedules.push(
          this.scheduleRepo.create({
            loanId: saved.id,
            periodNumber: i,
            dueDate: dates[i - 1],
            // Convenio sin intereses: el capital de cada cuota ES el pago completo.
            principalDue: pmt,
            interestDue: 0,
            totalDue: pmt,
            balanceDue: pmt,
            status: ScheduleStatus.PENDIENTE,
          }),
        );
      }
      await qr.manager.save(schedules);

      await qr.commitTransaction();
      return {
        loan: saved,
        schedulesGenerated: schedules.length,
        cuota,
        message: "Convenio generado. El crédito anterior quedó archivado.",
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── PDF DEL CONVENIO ─────────────────────────────────────────
  // Genera el documento legal del convenio a partir del crédito de convenio.
  // Deudor = cliente; Acreedor = config de empresa; penalización = ConfigMora.
  async getConvenioPdf(loanId: string, res: Response): Promise<void> {
    const loan = await this.loanRepo.findOne({
      where: { id: loanId },
      relations: ["customer", "paymentSchedules"],
    });
    if (!loan) throw new NotFoundException("Convenio no encontrado");
    if (!loan.isConvenio)
      throw new BadRequestException("Este crédito no es un convenio");

    const company = await this.companyService.get().catch(() => null);
    const penalizacionDia = await this.configMoraService
      .getMoraPorDia()
      .catch(() => 0);

    // Domicilio del cliente (JSON: street, colonia, municipality, state, zip)
    const dir = (loan.customer as any)?.address;
    const deudorDomicilio = dir
      ? [dir.street, dir.colonia, dir.municipality, dir.state, dir.zip]
          .filter(Boolean)
          .join(", ")
      : "domicilio conocido";

    // Domicilio del acreedor (config de empresa)
    const acreedorDomicilio =
      [company?.address, company?.city, company?.state]
        .filter(Boolean)
        .join(", ") || "domicilio conocido";

    const schedules = (loan.paymentSchedules || []).sort(
      (a, b) => a.periodNumber - b.periodNumber,
    );
    const primera = schedules[0];
    const ultima = schedules[schedules.length - 1];

    const lugar = company?.city
      ? `${company.city}${company?.state ? ", " + company.state : ""}, México`
      : "Ciudad Ixtepec, Oaxaca, México";

    return this.pdfService.generateConvenioPdf(
      {
        // Encabezado azul (mismo estilo que el contrato).
        companyName: company?.name || "Microcapital-Ixtepec",
        companyAddress: company
          ? [company.address, company.city, company.state]
              .filter(Boolean)
              .join(", ")
          : "",
        folio: (loan.id || "").toUpperCase(),
        lugarFecha: `${lugar}. A ${this.fechaLargaMx(new Date())}.`,
        deudorNombre: loan.customer?.fullName || "",
        deudorDomicilio,
        acreedorNombre: company?.name || "Micro Capital",
        acreedorDomicilio,
        montoDeuda: this.moneyMx(Number(loan.principalAmount)),
        numPagosTexto: this.numeroEnPalabras(loan.termWeeks),
        periodicidadTexto: this.periodicidadTexto(loan.frequency),
        cuota: this.moneyMx(Number(loan.periodicPayment)),
        fechaInicio: primera ? this.fechaLargaMx(primera.dueDate) : "",
        fechaFin: ultima ? this.fechaLargaMx(ultima.dueDate) : "",
        penalizacionDia: this.moneyMx(penalizacionDia),
        penalizacionDiaTexto: `${this.numeroEnPalabras(Math.round(penalizacionDia))} pesos 00/100 M.N.`,
        logoPath: company?.logoPath,
        // Calendario de pagos para incluir la tabla en el documento.
        schedule: schedules.map((s) => ({
          period: s.periodNumber,
          dueDate: s.dueDate,
          payment: Number(s.totalDue),
        })),
      },
      res,
    );
  }

  // Helpers de formato para el convenio (fechas en zona de México).
  private readonly MESES_MX = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  private fechaLargaMx(fecha: Date | string): string {
    const d = typeof fecha === "string" ? new Date(fecha) : fecha;
    // Las fechas de vencimiento/creación se guardan ancladas a medianoche UTC
    // (día-calendario de México), así que se leen en UTC para no correr el día.
    const day = String(d.getUTCDate()).padStart(2, "0");
    const m = d.getUTCMonth();
    const y = d.getUTCFullYear();
    return `${day} de ${this.MESES_MX[m]} del ${y}`;
  }
  private readonly NUMS_MX = [
    "cero",
    "un",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
    "dieciséis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
    "veinte",
    "veintiún",
    "veintidós",
    "veintitrés",
    "veinticuatro",
    "veinticinco",
    "veintiséis",
    "veintisiete",
    "veintiocho",
    "veintinueve",
    "treinta",
  ];
  private numeroEnPalabras(n: number): string {
    return this.NUMS_MX[n] ?? String(n);
  }
  private periodicidadTexto(p: string): string {
    switch ((p || "").toUpperCase()) {
      case "DIARIO":
        return "diarios";
      case "SEMANAL":
        return "semanales";
      case "QUINCENAL":
        return "quincenales";
      case "MENSUAL":
        return "mensuales";
      default:
        return "periódicos";
    }
  }
  private moneyMx(n: number): string {
    return Number(n || 0).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  async generateControlCard(id: string, res: Response): Promise<void> {
    const loan = await this.loanRepo.findOne({
      where: { id },
      relations: ["customer", "loanType"],
    });
    if (!loan) throw new NotFoundException("Préstamo no encontrado");
    if (!loan.disbursedAt)
      throw new BadRequestException("El préstamo no ha sido desembolsado");

    const guarantor = await this.guarantorService.findByLoan(id);
    const company = await this.companyService.get().catch(() => null);
    const loanCount = await this.loanRepo.count({
      where: { customerId: loan.customerId },
    });

    return this.pdfService.generateControlCard(
      {
        loan: {
          id: loan.id,
          principalAmount: Number(loan.principalAmount),
          interestRate: Number(loan.interestRate),
          totalRate: Number((loan as any).totalRate || 0),
          termWeeks: loan.termWeeks,
          frequency: loan.frequency,
          periodicPayment: Number(loan.periodicPayment),
          totalAmount: Number(loan.totalAmount),
          disbursedAt: loan.disbursedAt,
        },
        customer: {
          fullName: loan.customer?.fullName || "",
          phone: loan.customer?.phone || "",
          curp: loan.customer?.curp || "",
        },
        guarantor: guarantor
          ? {
              fullName: guarantor.fullName,
              phone: guarantor.phone,
            }
          : undefined,
        companyName: company?.name,
        loanNumber: loanCount,
      },
      res,
    );
  }

  async generateSimulationPdf(dto: any, res: Response): Promise<void> {
    const sim = await this.simulate(dto);
    const company = await this.companyService.get().catch(() => null);
    return this.pdfService.generateSimulationPdf(
      {
        principalAmount: dto.principalAmount,
        interestRate: sim.percentage,
        termWeeks: sim.days,
        frequency: "DIARIO",
        totalRate: sim.percentage,
        periodicPayment: sim.periodicPayment,
        totalPayment: sim.totalPayment,
        totalInterest: sim.totalInterest,
        schedule: sim.schedule,
        customerName: dto.customerName,
        generatedAt: new Date(),
        companyName: company?.name,
        legalFooter: company?.legalFooter,
      },
      res,
    );
  }

  /**
   * PDF del calendario/plan de pagos de un crédito YA EXISTENTE.
   * (Distinto de generateSimulationPdf, que simula uno nuevo sin guardarlo.)
   */
  async generateSchedulePdf(id: string, res: Response): Promise<void> {
    const loan = await this.loanRepo.findOne({
      where: { id },
      relations: ["customer", "loanType", "paymentSchedules"],
    });
    if (!loan) throw new NotFoundException("Préstamo no encontrado");

    const company = await this.companyService.get().catch(() => null);
    const schedules = (loan.paymentSchedules || []).sort(
      (a, b) => a.periodNumber - b.periodNumber,
    );

    return this.pdfService.generateSimulationPdf(
      {
        principalAmount: Number(loan.principalAmount),
        interestRate: Number(loan.interestRate),
        termWeeks: loan.termWeeks,
        frequency: loan.frequency,
        totalRate: Number((loan as any).totalRate || 0),
        periodicPayment: Number(loan.periodicPayment || 0),
        totalPayment: Number(loan.totalAmount || 0),
        totalInterest:
          Number(loan.totalAmount || 0) - Number(loan.principalAmount),
        schedule: schedules.map((s) => ({
          period: s.periodNumber,
          dueDate: s.dueDate,
          payment: Number(s.totalDue),
          principal: Number(s.principalDue),
          interest: Number(s.interestDue),
          balance: Number(s.balanceDue),
        })),
        customerName: loan.customer?.fullName,
        generatedAt: new Date(),
        companyName: company?.name,
        legalFooter: company?.legalFooter,
        logoPath: (company as any)?.logoPath,
      },
      res,
    );
  }

  async generateLoanPdf(id: string, res: Response): Promise<void> {
    const loan = await this.loanRepo.findOne({
      where: { id },
      relations: ["customer", "loanType", "paymentSchedules"],
    });
    if (!loan) throw new NotFoundException("Préstamo no encontrado");
    if (!loan.disbursedAt)
      throw new BadRequestException("El préstamo no ha sido desembolsado");

    const guarantor = await this.guarantorService.findByLoan(id);
    const company = await this.companyService.get().catch(() => null);
    const schedules = (loan.paymentSchedules || []).sort(
      (a, b) => a.periodNumber - b.periodNumber,
    );

    return this.pdfService.generateLoanPdf(
      {
        loan: {
          id: loan.id,
          principalAmount: Number(loan.principalAmount),
          interestRate: Number(loan.interestRate),
          totalRate: Number((loan as any).totalRate || 0),
          termWeeks: loan.termWeeks,
          frequency: loan.frequency,
          periodicPayment: Number(loan.periodicPayment),
          totalAmount: Number(loan.totalAmount),
          disbursedAt: loan.disbursedAt,
          disbursementMethod: loan.disbursementMethod || "EFECTIVO",
          restructureCount: loan.restructureCount,
          // Identifican el tipo de documento (contrato / convenio / reestructura)
          status: loan.status,
          isConvenio: (loan as any).isConvenio || false,
          parentLoanId: loan.parentLoanId || null,
          restructureReason: loan.restructureReason || null,
        },
        customer: {
          fullName: loan.customer?.fullName || "",
          curp: loan.customer?.curp || "",
          rfc: loan.customer?.rfc,
          phone: loan.customer?.phone || "",
          email: loan.customer?.email,
          address: loan.customer?.address,
        },
        loanType: { name: loan.loanType?.name || "" },
        schedules,
        guarantor: guarantor
          ? {
              fullName: guarantor.fullName,
              curp: guarantor.curp,
              rfc: guarantor.rfc,
              phone: guarantor.phone,
              address: guarantor.address,
              relationship: guarantor.relationship,
            }
          : undefined,
        companyName: company?.name,
        legalFooter: company?.legalFooter,
        logoPath: company?.logoPath,
        companyAddress: [company.address, company.city, company.state]
          .filter(Boolean)
          .join(", "),
      },
      res,
    );
  }
}

// ── LOANS CONTROLLER ──────────────────────────────────────────
@ApiTags("loans")
@ApiBearerAuth()
@Controller("loans")
export class LoansController {
  constructor(private loansService: LoansService) {}

  @Get() @Auth() findAll(@Query() q: any) {
    return this.loansService.findAll(q);
  }
  @Get("reportes/proximos-liquidar")
  @AuthPermission("prestamos.proximos")
  proximosLiquidar(@Query("max") max?: string) {
    return this.loansService.getProximosLiquidar(max ? Number(max) : 3);
  }
  @Get(":id/renovacion-info") @Auth() renovacionInfo(@Param("id") id: string) {
    return this.loansService.getRenovacionInfo(id);
  }
  @Post(":id/renovar")
  @AuthPermission("prestamos.reestructurar")
  renovar(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("id") uid: string,
  ) {
    return this.loansService.renovar(id, dto, uid);
  }

  @Post(":id/convenio")
  @AuthPermission("prestamos.reestructurar", "movil.convenio")
  convenio(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("id") uid: string,
  ) {
    return this.loansService.convenio(id, dto, uid);
  }

  // PDF del convenio de pago (documento legal para firma).
  @Get(":id/convenio-pdf")
  @Auth()
  convenioPdf(@Param("id") id: string, @Res() res: Response) {
    return this.loansService.getConvenioPdf(id, res);
  }

  // Corregir monto de un crédito (carga manual errónea). NO regenera calendario.
  @Patch(":id/monto")
  @AuthPermission("prestamos.editar-monto")
  updateMonto(
    @Param("id") id: string,
    @Body() dto: { principalAmount: number; totalAmount: number },
  ) {
    return this.loansService.updateMonto(id, dto);
  }

  @Get(":id") @Auth() findOne(@Param("id") id: string) {
    return this.loansService.findOne(id);
  }
  @Post() @Auth() create(@Body() dto: any, @CurrentUser("id") uid: string) {
    return this.loansService.create(dto, uid);
  }

  @Post("carga-manual") @Auth() cargaManual(
    @Body() dto: any,
    @CurrentUser("id") uid: string,
  ) {
    return this.loansService.cargaManual(dto, uid);
  }

  @Post("simulate") @Auth() simulate(@Body() dto: any) {
    return this.loansService.simulate(dto);
  }
  @Post("simulate/pdf") @Auth() simulatePdf(
    @Body() dto: any,
    @Res() res: Response,
  ) {
    return this.loansService.generateSimulationPdf(dto, res);
  }
  @Get(":id/pdf") @Auth() loanPdf(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    return this.loansService.generateLoanPdf(id, res);
  }
  @Get(":id/plan-pdf") @Auth() planPdf(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    return this.loansService.generateSchedulePdf(id, res);
  }
  @Get(":id/schedule") @Auth() getSchedule(@Param("id") id: string) {
    return this.loansService.getSchedule(id);
  }
  @Get(":id/control-card") @Auth() controlCard(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    return this.loansService.generateControlCard(id, res);
  }

  @Post(":id/authorize")
  @Auth(UserRole.AUTORIZADOR, UserRole.ADMIN)
  authorize(
    @Param("id") id: string,
    @Body() body: { decision: "APPROVE" | "REJECT"; rejectionReason?: string },
    @CurrentUser("id") uid: string,
  ) {
    return this.loansService.authorize(
      id,
      body.decision,
      uid,
      body.rejectionReason,
    );
  }

  @Post(":id/disburse")
  @Auth(UserRole.ADMIN, UserRole.CAJERO)
  disburse(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("id") uid: string,
  ) {
    return this.loansService.disburse(id, dto, uid);
  }

  @Post(":id/restructure")
  @AuthPermission("prestamos.reestructurar", "movil.reestructura")
  restructure(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser("id") uid: string,
  ) {
    return this.loansService.restructure(id, dto, uid);
  }
}

// ── MODULE ───────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Loan,
      LoanType,
      PaymentSchedule,
      Customer,
      PlazoCredito,
    ]),
    PdfGeneratorModule,
    GuarantorModule,
    CompanyModule,
    PlazosCreditoModule,
    ConfigMoraModule,
  ],
  providers: [LoansService, FinancialCalculator],
  controllers: [LoansController],
  exports: [LoansService, FinancialCalculator],
})
export class LoansModule {}