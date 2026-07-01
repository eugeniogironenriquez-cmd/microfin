import {
  Module, Controller, Injectable, Get, Put,
  Body, Param, Query, OnModuleInit,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Loan, PaymentSchedule, Customer,
  ConfigSemaforo, HistorialComportamiento,
  LoanStatus, ScheduleStatus,
} from '../common/entities';
import { Auth, AuthPermission } from '../common/guards/roles.guard';

export type SemaforoLevel = 'VERDE' | 'AMARILLO' | 'ROJO';

@Injectable()
export class SemaforoService implements OnModuleInit {
  constructor(
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
    @InjectRepository(ConfigSemaforo) private cfgRepo: Repository<ConfigSemaforo>,
    @InjectRepository(HistorialComportamiento) private histRepo: Repository<HistorialComportamiento>,
  ) {}

  async onModuleInit() {
    const cfg = await this.cfgRepo.findOne({ where: { id: 1 } });
    if (!cfg) {
      await this.cfgRepo.save(this.cfgRepo.create({ id: 1, greenUpTo: 0, yellowUpTo: 5 }));
    }
  }

  // ── CONFIG ───────────────────────────────────────────────────
  async getConfig(): Promise<ConfigSemaforo> {
    let cfg = await this.cfgRepo.findOne({ where: { id: 1 } });
    if (!cfg) cfg = await this.cfgRepo.save(this.cfgRepo.create({ id: 1, greenUpTo: 0, yellowUpTo: 5 }));
    return cfg;
  }

  async updateConfig(dto: { greenUpTo: number; yellowUpTo: number }): Promise<ConfigSemaforo> {
    const cfg = await this.getConfig();
    cfg.greenUpTo = dto.greenUpTo;
    cfg.yellowUpTo = dto.yellowUpTo;
    return this.cfgRepo.save(cfg);
  }

  // Determina el nivel según cuotas vencidas y los umbrales configurados
  levelFor(overdueCount: number, cfg: ConfigSemaforo): SemaforoLevel {
    if (overdueCount <= cfg.greenUpTo) return 'VERDE';
    if (overdueCount <= cfg.yellowUpTo) return 'AMARILLO';
    return 'ROJO';
  }

  // Cuenta las cuotas vencidas (no pagadas con fecha de vencimiento ya pasada)
  // usando día-calendario de México (UTC-6).
  async countOverdue(loanId: string): Promise<number> {
    const schedules = await this.scheduleRepo.find({
      where: { loanId },
    });
    const MX = 6 * 60 * 60 * 1000;
    const now = new Date();
    const nowDay = new Date(now.getTime() - MX);
    const todayUTC = Date.UTC(nowDay.getUTCFullYear(), nowDay.getUTCMonth(), nowDay.getUTCDate());

    let count = 0;
    for (const s of schedules) {
      if (s.status === ScheduleStatus.PAGADO) continue;
      // La fecha de vencimiento ya está anclada a medianoche UTC (día-calendario
      // de México), así que NO se le aplica el offset MX. Solo a 'now' (arriba).
      const due = new Date(s.dueDate);
      const dueUTC = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
      // Vencida solo si su día es estrictamente anterior a hoy (la que vence hoy no cuenta)
      if (dueUTC < todayUTC) count++;
    }
    return count;
  }

  // ── MONITOR DE CARTERA ───────────────────────────────────────
  // Devuelve todos los créditos activos/vencidos con su nivel de semáforo.
  // Si se pasa 'nivel', filtra por ese nivel (lo usa la vista del gestor).
  async getMonitor(filters: { nivel?: SemaforoLevel; search?: string } = {}) {
    const cfg = await this.getConfig();

    const qb = this.loanRepo.createQueryBuilder('l')
      .leftJoinAndSelect('l.customer', 'c')
      .where('l.status IN (:...st)', { st: [LoanStatus.ACTIVO, LoanStatus.VENCIDO, LoanStatus.ATRASADO] });

    if (filters.search) {
      qb.andWhere('(c.fullName LIKE :s OR c.phone LIKE :s)', { s: `%${filters.search}%` });
    }

    const loans = await qb.getMany();

    const rows = [];
    for (const loan of loans) {
      const overdueCount = await this.countOverdue(loan.id);
      const level = this.levelFor(overdueCount, cfg);
      rows.push({
        id: loan.id,
        customerId: loan.customerId,
        customerName: loan.customer?.fullName || '',
        customerPhone: loan.customer?.phone || '',
        principalAmount: Number(loan.principalAmount),
        periodicPayment: Number(loan.periodicPayment),
        totalAmount: Number(loan.totalAmount),
        status: loan.status,
        disbursedAt: loan.disbursedAt,
        overdueCount,
        level,
      });

      // Registrar historial si entró en amarillo o rojo
      await this.recordHistoryIfNeeded(loan.customerId, loan.id, level, overdueCount);
    }

    // Filtrar por nivel si se pidió
    const filtered = filters.nivel ? rows.filter(r => r.level === filters.nivel) : rows;

    // Ordenar: rojos primero, luego amarillos, luego verdes; dentro, más atraso primero
    const order = { ROJO: 0, AMARILLO: 1, VERDE: 2 };
    filtered.sort((a, b) => order[a.level] - order[b.level] || b.overdueCount - a.overdueCount);

    // Resumen de conteos
    const summary = {
      verde:    rows.filter(r => r.level === 'VERDE').length,
      amarillo: rows.filter(r => r.level === 'AMARILLO').length,
      rojo:     rows.filter(r => r.level === 'ROJO').length,
      total:    rows.length,
    };

    return { data: filtered, summary, config: cfg };
  }

  // Registra un evento en el historial si el crédito está en amarillo o rojo,
  // evitando duplicar el mismo nivel el mismo día.
  private async recordHistoryIfNeeded(
    customerId: string, loanId: string, level: SemaforoLevel, overdueCount: number,
  ) {
    if (level === 'VERDE') return;

    // ¿Ya hay un registro de este nivel para este crédito hoy?
    const MX = 6 * 60 * 60 * 1000;
    const now = new Date();
    const nowDay = new Date(now.getTime() - MX);
    const startOfDay = new Date(Date.UTC(nowDay.getUTCFullYear(), nowDay.getUTCMonth(), nowDay.getUTCDate()));

    const recent = await this.histRepo
      .createQueryBuilder('h')
      .where('h.loanId = :loanId', { loanId })
      .andWhere('h.level = :level', { level })
      .andWhere('h.recordedAt >= :start', { start: startOfDay })
      .getOne();

    if (recent) return; // ya registrado hoy

    await this.histRepo.save(this.histRepo.create({
      customerId, loanId, level, overdueCount,
    }));
  }

  // ── HISTORIAL DE UN CLIENTE ──────────────────────────────────
  // Para mostrar el comportamiento al generar una nueva solicitud.
  async getCustomerHistory(customerId: string) {
    const events = await this.histRepo.find({
      where: { customerId },
      order: { recordedAt: 'DESC' },
    });

    const totalEventos = events.length;
    const vecesRojo = events.filter(e => e.level === 'ROJO').length;
    const vecesAmarillo = events.filter(e => e.level === 'AMARILLO').length;
    const maxCuotasVencidas = events.reduce((max, e) => Math.max(max, e.overdueCount), 0);

    return {
      resumen: {
        totalEventos,
        vecesRojo,
        vecesAmarillo,
        maxCuotasVencidas,
        tieneProblemas: totalEventos > 0,
      },
      eventos: events.slice(0, 20), // últimos 20
    };
  }
}

@ApiTags('semaforo')
@ApiBearerAuth()
@Controller('semaforo')
export class SemaforoController {
  constructor(private svc: SemaforoService) {}

  // Monitor de cartera completo (todos los niveles)
  @Get('monitor') @AuthPermission('cartera.semaforo')
  monitor(@Query() q: any) {
    return this.svc.getMonitor({ nivel: q.nivel, search: q.search });
  }

  // Vista del gestor de cobranza: solo los rojos
  @Get('gestor') @AuthPermission('cobranza.gestor')
  gestor(@Query() q: any) {
    return this.svc.getMonitor({ nivel: 'ROJO', search: q.search });
  }

  // Historial de comportamiento de un cliente
  @Get('historial/:customerId') @Auth()
  historial(@Param('customerId') customerId: string) {
    return this.svc.getCustomerHistory(customerId);
  }

  // Config de umbrales
  @Get('config') @Auth()
  getConfig() { return this.svc.getConfig(); }

  @Put('config') @AuthPermission('config.editar')
  updateConfig(@Body() dto: { greenUpTo: number; yellowUpTo: number }) {
    return this.svc.updateConfig(dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([
    Loan, PaymentSchedule, Customer, ConfigSemaforo, HistorialComportamiento,
  ])],
  providers: [SemaforoService],
  controllers: [SemaforoController],
  exports: [SemaforoService],
})
export class SemaforoModule {}