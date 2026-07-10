import {
  Module,
  Controller,
  Injectable,
  Get,
  Post,
  Body,
  Param,
  Query,
} from "@nestjs/common";
import { TypeOrmModule, InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import {
  CollectionVisit,
  CollectorAssignment,
  Loan,
  LoanStatus,
  ScheduleStatus,
  UserRole,
} from "../common/entities";
import { Auth, CurrentUser } from "../common/guards/roles.guard";
import { SemaforoService } from "../semaforo/semaforo.module";
import { SemaforoModule } from "../semaforo/semaforo.module";

@Injectable()
export class CollectionService {
  constructor(
    @InjectRepository(CollectionVisit)
    private visitRepo: Repository<CollectionVisit>,
    @InjectRepository(CollectorAssignment)
    private assignRepo: Repository<CollectorAssignment>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    private semaforoService: SemaforoService,
  ) {}

  async getMyLoans(collectorId: string) {
    // Se agrega el join de paymentSchedules para calcular cuotas vencidas,
    // y ATRASADO al filtro para no perder créditos atrasados (igual que el semáforo).
    const loans = await this.loanRepo
      .createQueryBuilder("l")
      .leftJoinAndSelect("l.customer", "c")
      .leftJoinAndSelect("l.loanType", "lt")
      .leftJoinAndSelect("l.paymentSchedules", "ps")
      .where("l.collectorId = :collectorId", { collectorId })
      .andWhere("l.status IN (:...statuses)", {
        statuses: [LoanStatus.ACTIVO, LoanStatus.ATRASADO, LoanStatus.VENCIDO],
      })
      .getMany();

    // Umbral configurado del semáforo (el mismo que usa la web).
    const cfg = await this.semaforoService.getConfig();

    // Calcular cuotas vencidas + nivel sobre las cuotas YA cargadas (sin
    // consultas extra). Misma lógica que SemaforoService.countOverdue:
    // cuota no pagada con fecha de vencimiento anterior a hoy (día-calendario
    // de México, UTC-6). La que vence hoy NO cuenta.
    const MX = 6 * 60 * 60 * 1000;
    const nowDay = new Date(Date.now() - MX);
    const todayUTC = Date.UTC(
      nowDay.getUTCFullYear(),
      nowDay.getUTCMonth(),
      nowDay.getUTCDate(),
    );

    return loans.map((loan) => {
      const schedules = (loan as any).paymentSchedules || [];

      let cuotasVencidas = 0;

      for (const s of schedules) {
        if (s.status === ScheduleStatus.PAGADO) {
          continue;
        }

        const due = new Date(s.dueDate);

        const dueUTC = Date.UTC(
          due.getUTCFullYear(),
          due.getUTCMonth(),
          due.getUTCDate(),
        );

        if (dueUTC < todayUTC) {
          cuotasVencidas++;
        }
      }

      const nivel = this.semaforoService.levelFor(cuotasVencidas, cfg);

      const cuotasPendientes = schedules
        .filter(
          (s: any) =>
            s.status !== ScheduleStatus.PAGADO &&
            Number(s.balanceDue ?? s.totalDue ?? 0) > 0,
        )
        .sort(
          (a: any, b: any) =>
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
        );

      const siguienteCuota = cuotasPendientes[0];

      const cuotaDelDia = cuotasPendientes.find((s: any) => {
        const due = new Date(s.dueDate);

        const dueUTC = Date.UTC(
          due.getUTCFullYear(),
          due.getUTCMonth(),
          due.getUTCDate(),
        );

        return dueUTC === todayUTC;
      });

      const proximaCuota = siguienteCuota
        ? {
            periodo: Number(siguienteCuota.periodNumber),
            vence: this.formatDateOnly(siguienteCuota.dueDate),
            monto: Number(
              siguienteCuota.balanceDue ??
                siguienteCuota.totalDue ??
                loan.periodicPayment ??
                0,
            ),
          }
        : null;

      const cuotaHoy = cuotaDelDia
        ? {
            periodo: Number(cuotaDelDia.periodNumber),
            vence: this.formatDateOnly(cuotaDelDia.dueDate),
            monto: Number(
              cuotaDelDia.balanceDue ??
                cuotaDelDia.totalDue ??
                loan.periodicPayment ??
                0,
            ),
          }
        : null;

      const { paymentSchedules, ...loanSinSchedules } = loan as any;

      return {
        ...loanSinSchedules,
        cuotasVencidas,
        nivel,
        proximaCuota,
        cuotaHoy,
        tieneCuotaHoy: cuotaHoy !== null,
      };
    });
  }

  private formatDateOnly(value: string | Date): string {
    if (!value) {
      return "";
    }

    if (typeof value === "string") {
      const match = value.match(/^\d{4}-\d{2}-\d{2}/);

      if (match) {
        return match[0];
      }
    }

    const date = new Date(value);

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  async registerVisit(dto: {
    loanId: string;
    collectorId: string;
    visitType: string;
    result?: string;
    notes?: string;
    geolocation?: string;
  }): Promise<CollectionVisit> {
    const visit = this.visitRepo.create({ ...dto, visitedAt: new Date() });
    return this.visitRepo.save(visit);
  }

  async assign(
    dto: { collectorId: string; loanIds: string[]; date: string },
    assignedBy: string,
  ) {
    const existing = await this.assignRepo.find({
      where: { collectorId: dto.collectorId, isActive: true },
    });
    for (const a of existing) {
      a.isActive = false;
      await this.assignRepo.save(a);
    }

    const assignments = dto.loanIds.map((loanId) =>
      this.assignRepo.create({
        collectorId: dto.collectorId,
        loanId,
        assignedAt: new Date(dto.date),
        isActive: true,
      }),
    );
    return this.assignRepo.save(assignments);
  }

  async getVisits(loanId: string) {
    return this.visitRepo.find({
      where: { loanId },
      order: { visitedAt: "DESC" },
    });
  }

  async getOverdue(filters: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = filters;
    const qb = this.loanRepo
      .createQueryBuilder("l")
      .leftJoinAndSelect("l.customer", "c")
      .leftJoinAndSelect("l.loanType", "lt")
      .where("l.status = :status", { status: LoanStatus.VENCIDO })
      .orderBy("l.updatedAt", "ASC")
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async bulkAssign(dto: {
    collectorId: string;
    loanIds: string[];
    date: string;
  }) {
    const results = [];
    for (const loanId of dto.loanIds) {
      await this.assignRepo.update(
        { loanId, isActive: true },
        { isActive: false },
      );
      await this.loanRepo.update(loanId, { collectorId: dto.collectorId });
      const assignment = this.assignRepo.create({
        loanId,
        collectorId: dto.collectorId,
        assignedAt: new Date(dto.date),
        isActive: true,
      });
      results.push(await this.assignRepo.save(assignment));
    }
    return { assigned: results.length };
  }
}

@ApiTags("collection")
@ApiBearerAuth()
@Controller("collection")
export class CollectionController {
  constructor(private collectionService: CollectionService) {}

  @Get("my-loans")
  @Auth(UserRole.COBRADOR, UserRole.ADMIN)
  getMyLoans(@CurrentUser("id") userId: string) {
    return this.collectionService.getMyLoans(userId);
  }

  @Get("my-clients")
  @Auth(UserRole.COBRADOR, UserRole.ADMIN)
  getMyClients(@CurrentUser("id") userId: string) {
    return this.collectionService.getMyLoans(userId);
  }

  @Post("visits")
  @Auth(UserRole.COBRADOR, UserRole.ADMIN)
  registerVisit(@Body() dto: any, @CurrentUser("id") userId: string) {
    return this.collectionService.registerVisit({
      ...dto,
      collectorId: userId,
    });
  }

  @Get("visits/:loanId")
  @Auth()
  getVisits(@Param("loanId") loanId: string) {
    return this.collectionService.getVisits(loanId);
  }

  @Post("assign")
  @Auth(UserRole.ADMIN)
  assign(@Body() dto: any, @CurrentUser("id") userId: string) {
    return this.collectionService.assign(dto, userId);
  }

  @Get("overdue")
  @Auth()
  getOverdue(@Query() q: any) {
    return this.collectionService.getOverdue({
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 20,
    });
  }

  @Post("assignments")
  @Auth(UserRole.ADMIN)
  bulkAssign(
    @Body() dto: { collectorId: string; loanIds: string[]; date: string },
  ) {
    return this.collectionService.bulkAssign(dto);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([CollectionVisit, CollectorAssignment, Loan]),
    SemaforoModule,
  ],
  providers: [CollectionService],
  controllers: [CollectionController],
  exports: [CollectionService],
})
export class CollectionModule {}
