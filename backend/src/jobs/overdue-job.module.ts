import { Injectable, Module, Controller, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Loan, PaymentSchedule, LoanStatus, ScheduleStatus } from '../common/entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Auth } from '../common/index';
import { UserRole } from '../common/entities';
import { ConfigMoraModule, ConfigMoraService } from '../config-mora/config-mora.module';

@Injectable()
export class OverdueJobService {
  // Ejecutar máximo una vez por día
  private lastRun: Date | null = null;

  constructor(
    @InjectRepository(Loan)            private loanRepo: Repository<Loan>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
    private moraService: ConfigMoraService,
  ) {}

  // Verifica si debe correr (máximo 1 vez por día)
  async runIfNeeded(): Promise<void> {
    const now = new Date();
    if (this.lastRun) {
      const sameDay =
        this.lastRun.getFullYear() === now.getFullYear() &&
        this.lastRun.getMonth()    === now.getMonth()    &&
        this.lastRun.getDate()     === now.getDate();
      if (sameDay) return; // ya corrió hoy
    }
    this.lastRun = now;
    const result = await this.markOverdueLoans();
    console.log(`[OverdueJob] ${now.toISOString()}: ${result.marked} vencidos, ${result.restored} restaurados, ${result.moraStamped} moras estampadas`);
  }

  async markOverdueLoans(): Promise<{ marked: number; restored: number; moraStamped: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── 1. ESTAMPAR MORA FIJA a cuotas recién vencidas ───────────
    // Cada cuota vencida y sin pagar que aún NO tenga mora estampada
    // recibe su mora fija (= monto configurado), UNA sola vez.
    // La condición `mora_generada = 0` evita duplicar si el job corre de nuevo.
    const moraPorDia = await this.moraService.getMoraPorDia();
    const rMora = await this.scheduleRepo.query(`
      UPDATE calendario_pagos
      SET mora_generada = ?
      WHERE estatus IN ('PENDIENTE','PARCIAL')
        AND fecha_vencimiento < ?
        AND mora_generada = 0
    `, [moraPorDia, today]);

    // Marcar VENCIDO los ACTIVO con cuotas vencidas
    const r1 = await this.loanRepo.query(`
      UPDATE prestamos p
      SET p.estatus = 'VENCIDO'
      WHERE p.estatus = 'ACTIVO'
        AND EXISTS (
          SELECT 1 FROM calendario_pagos cp
          WHERE cp.prestamo_id = p.id
            AND cp.estatus IN ('PENDIENTE','PARCIAL')
            AND cp.fecha_vencimiento < ?
        )
    `, [today]);

    // Restaurar a ACTIVO los VENCIDO que ya no tienen cuotas vencidas
    // NOTA: aunque la cuota se pague, su mora_generada permanece como adeudo.
    // Un préstamo puede volver a ACTIVO pero seguir debiendo mora registrada.
    const r2 = await this.loanRepo.query(`
      UPDATE prestamos p
      SET p.estatus = 'ACTIVO'
      WHERE p.estatus = 'VENCIDO'
        AND NOT EXISTS (
          SELECT 1 FROM calendario_pagos cp
          WHERE cp.prestamo_id = p.id
            AND cp.estatus IN ('PENDIENTE','PARCIAL')
            AND cp.fecha_vencimiento < ?
        )
    `, [today]);

    return {
      marked:   r1.affectedRows || 0,
      restored: r2.affectedRows || 0,
      moraStamped: rMora.affectedRows || 0,
    };
  }
}

@Controller('jobs')
export class OverdueJobController {
  constructor(private svc: OverdueJobService) {}

  @Post('mark-overdue')
  @Auth(UserRole.ADMIN)
  runNow() { return this.svc.markOverdueLoans(); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Loan, PaymentSchedule]), ConfigMoraModule],
  providers: [OverdueJobService],
  controllers: [OverdueJobController],
  exports: [OverdueJobService],
})
export class OverdueJobModule {}
