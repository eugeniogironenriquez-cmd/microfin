import { Injectable, Module, Controller, Post } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  Loan,
  PaymentSchedule,
  LoanStatus,
  ScheduleStatus,
} from "../common/entities";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Auth } from "../common/index";
import { UserRole } from "../common/entities";
import {
  ConfigMoraModule,
  ConfigMoraService,
} from "../config-mora/config-mora.module";

@Injectable()
export class OverdueJobService {
  // Ejecutar máximo una vez por día
  private lastRun: Date | null = null;

  constructor(
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(PaymentSchedule)
    private scheduleRepo: Repository<PaymentSchedule>,
    private moraService: ConfigMoraService,
  ) {}

  // Verifica si debe correr (máximo 1 vez por día)
  async runIfNeeded(): Promise<void> {
    const MX = 6 * 60 * 60 * 1000;
    // Día-calendario de México para el control de "ya corrió hoy", consistente
    // con el cálculo de mora (que también usa el día de México).
    const now = new Date(Date.now() - MX);
    if (this.lastRun) {
      const sameDay =
        this.lastRun.getUTCFullYear() === now.getUTCFullYear() &&
        this.lastRun.getUTCMonth() === now.getUTCMonth() &&
        this.lastRun.getUTCDate() === now.getUTCDate();
      if (sameDay) return; // ya corrió hoy (día de México)
    }
    this.lastRun = now;
    const result = await this.markOverdueLoans();
    console.log(
      `[OverdueJob] ${new Date().toISOString()}: ${result.vencidos} vencidos, ${result.atrasados} atrasados, ${result.restored} al corriente, ${result.moraStamped} moras estampadas`,
    );
  }

  async refreshLoanStatus(loanId: string): Promise<LoanStatus> {
    const MX = 6 * 60 * 60 * 1000;
    const mxNow = new Date(Date.now() - MX);

    const today = new Date(
      Date.UTC(
        mxNow.getUTCFullYear(),
        mxNow.getUTCMonth(),
        mxNow.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );

    const pendientes = await this.scheduleRepo.find({
      where: {
        loanId,
        status: In([ScheduleStatus.PENDIENTE, ScheduleStatus.PARCIAL]),
      },
      order: {
        dueDate: "ASC",
      },
    });

    if (pendientes.length === 0) {
      await this.loanRepo.update(loanId, {
        status: LoanStatus.LIQUIDADO,
      });

      return LoanStatus.LIQUIDADO;
    }

    const tieneVencidas = pendientes.some(
      (cuota) => new Date(cuota.dueDate) < today,
    );

    const tieneActualesOFuturas = pendientes.some(
      (cuota) => new Date(cuota.dueDate) >= today,
    );

    let nuevoEstado: LoanStatus;

    if (!tieneVencidas) {
      nuevoEstado = LoanStatus.ACTIVO;
    } else if (tieneActualesOFuturas) {
      nuevoEstado = LoanStatus.ATRASADO;
    } else {
      nuevoEstado = LoanStatus.VENCIDO;
    }

    await this.loanRepo.update(loanId, {
      status: nuevoEstado,
    });

    return nuevoEstado;
  }

  async markOverdueLoans(): Promise<{
    vencidos: number;
    atrasados: number;
    restored: number;
    moraStamped: number;
  }> {
    // El servidor corre en UTC; la empresa opera en México (UTC-6). Las fechas de
    // vencimiento están ancladas a medianoche UTC = día-calendario de México.
    // Calculamos "hoy" como el día-calendario de México para que una cuota que
    // vence HOY no genere mora hasta que el día (en México) haya terminado.
    const MX = 6 * 60 * 60 * 1000;
    const mxNow = new Date(Date.now() - MX);
    const today = new Date(
      Date.UTC(
        mxNow.getUTCFullYear(),
        mxNow.getUTCMonth(),
        mxNow.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );

    // ── 1. ESTAMPAR MORA FIJA a cuotas recién vencidas ───────────
    // Cada cuota vencida y sin pagar que aún NO tenga mora estampada
    // recibe su mora fija (= monto configurado), UNA sola vez.
    // La condición `mora_generada = 0` evita duplicar si el job corre de nuevo.
    const moraPorDia = await this.moraService.getMoraPorDia();
    const rMora = await this.scheduleRepo.query(
      `
      UPDATE calendario_pagos
      SET mora_generada = ?
      WHERE estatus IN ('PENDIENTE','PARCIAL')
        AND fecha_vencimiento < ?
        AND mora_generada = 0
    `,
      [moraPorDia, today],
    );

    // ── 2. MARCAR ESTADOS según cuotas vencidas y fin del plazo ──
    // Definiciones:
    //   VENCIDO  = debe cuotas Y la ÚLTIMA cuota del calendario ya venció (plazo terminado)
    //   ATRASADO = debe cuotas vencidas PERO aún hay cuotas futuras (el plazo sigue)
    //   ACTIVO   = sin cuotas vencidas (al corriente)
    // Tratamos juntos los estados "vivos" ACTIVO/ATRASADO/VENCIDO para poder
    // mover un crédito en cualquier dirección según su situación actual.

    // VENCIDO: tiene cuotas pendientes vencidas Y NO existe ninguna cuota
    // pendiente con fecha de vencimiento >= hoy (es decir, ya no quedan
    // cuotas futuras: el plazo se acabó y aún debe).
    const rVencido = await this.loanRepo.query(
      `
      UPDATE prestamos p
      SET p.estatus = 'VENCIDO'
      WHERE p.estatus IN ('ACTIVO','ATRASADO','VENCIDO')
        AND EXISTS (
          SELECT 1 FROM calendario_pagos cp
          WHERE cp.prestamo_id = p.id
            AND cp.estatus IN ('PENDIENTE','PARCIAL')
            AND cp.fecha_vencimiento < ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM calendario_pagos cp2
          WHERE cp2.prestamo_id = p.id
            AND cp2.estatus IN ('PENDIENTE','PARCIAL')
            AND cp2.fecha_vencimiento >= ?
        )
    `,
      [today, today],
    );

    // ATRASADO: tiene cuotas pendientes vencidas PERO todavía existen cuotas
    // pendientes futuras (fecha_vencimiento >= hoy): el plazo sigue corriendo.
    const rAtrasado = await this.loanRepo.query(
      `
      UPDATE prestamos p
      SET p.estatus = 'ATRASADO'
      WHERE p.estatus IN ('ACTIVO','ATRASADO','VENCIDO')
        AND EXISTS (
          SELECT 1 FROM calendario_pagos cp
          WHERE cp.prestamo_id = p.id
            AND cp.estatus IN ('PENDIENTE','PARCIAL')
            AND cp.fecha_vencimiento < ?
        )
        AND EXISTS (
          SELECT 1 FROM calendario_pagos cp2
          WHERE cp2.prestamo_id = p.id
            AND cp2.estatus IN ('PENDIENTE','PARCIAL')
            AND cp2.fecha_vencimiento >= ?
        )
    `,
      [today, today],
    );

    // ACTIVO (al corriente): estaba ATRASADO o VENCIDO pero ya NO tiene
    // ninguna cuota pendiente vencida. Vuelve a ACTIVO.
    // NOTA: aunque la cuota se pague, su mora_generada permanece como adeudo.
    const rActivo = await this.loanRepo.query(
      `
      UPDATE prestamos p
      SET p.estatus = 'ACTIVO'
      WHERE p.estatus IN ('ATRASADO','VENCIDO')
        AND NOT EXISTS (
          SELECT 1 FROM calendario_pagos cp
          WHERE cp.prestamo_id = p.id
            AND cp.estatus IN ('PENDIENTE','PARCIAL')
            AND cp.fecha_vencimiento < ?
        )
    `,
      [today],
    );

    return {
      vencidos: rVencido.affectedRows || 0,
      atrasados: rAtrasado.affectedRows || 0,
      restored: rActivo.affectedRows || 0,
      moraStamped: rMora.affectedRows || 0,
    };
  }
}

@Controller("jobs")
export class OverdueJobController {
  constructor(private svc: OverdueJobService) {}

  @Post("mark-overdue")
  @Auth(UserRole.ADMIN)
  runNow() {
    return this.svc.markOverdueLoans();
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Loan, PaymentSchedule]),
    ConfigMoraModule,
  ],
  providers: [OverdueJobService],
  controllers: [OverdueJobController],
  exports: [OverdueJobService],
})
export class OverdueJobModule {}
