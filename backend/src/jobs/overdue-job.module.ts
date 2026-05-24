import { Injectable, Module, Controller, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Loan, PaymentSchedule, LoanStatus, ScheduleStatus } from '../common/entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Auth } from '../common/index';
import { UserRole } from '../common/entities';

@Injectable()
export class OverdueJobService {
  // Ejecutar máximo una vez por día
  private lastRun: Date | null = null;

  constructor(
    @InjectRepository(Loan)            private loanRepo: Repository<Loan>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
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
    console.log(`[OverdueJob] ${now.toISOString()}: ${result.marked} vencidos, ${result.restored} restaurados`);
  }

  async markOverdueLoans(): Promise<{ marked: number; restored: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
  imports: [TypeOrmModule.forFeature([Loan, PaymentSchedule])],
  providers: [OverdueJobService],
  controllers: [OverdueJobController],
  exports: [OverdueJobService],
})
export class OverdueJobModule {}