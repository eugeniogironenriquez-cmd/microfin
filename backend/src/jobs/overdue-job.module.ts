import { Injectable, Module, Controller, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Loan, PaymentSchedule, LoanStatus, ScheduleStatus } from '../common/entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Auth } from '../common/index';
import { UserRole } from '../common/entities';

@Injectable()
export class OverdueJobService {
  constructor(
    @InjectRepository(Loan)            private loanRepo: Repository<Loan>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
  ) {}

  async markOverdueLoans(): Promise<{ marked: number; restored: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Marcar como VENCIDO los préstamos ACTIVO con cuotas vencidas sin pagar
    const result = await this.loanRepo.createQueryBuilder()
      .update(Loan)
      .set({ status: LoanStatus.VENCIDO })
      .where('status = :status', { status: LoanStatus.ACTIVO })
      .andWhere(`id IN (
        SELECT DISTINCT ps.prestamo_id FROM calendario_pagos ps
        WHERE ps.estatus IN ('PENDIENTE','PARCIAL')
        AND ps.fecha_vencimiento < :today
      )`, { today })
      .execute();

    const marked = result.affected || 0;

    // 2. Restaurar a ACTIVO los préstamos VENCIDO que ya no tienen cuotas vencidas
    const result2 = await this.loanRepo.createQueryBuilder()
      .update(Loan)
      .set({ status: LoanStatus.ACTIVO })
      .where('status = :status', { status: LoanStatus.VENCIDO })
      .andWhere(`id NOT IN (
        SELECT DISTINCT ps.prestamo_id FROM calendario_pagos ps
        WHERE ps.estatus IN ('PENDIENTE','PARCIAL')
        AND ps.fecha_vencimiento < :today
      )`, { today })
      .execute();

    const restored = result2.affected || 0;

    return { marked, restored };
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