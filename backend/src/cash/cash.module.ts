import {
  Module, Controller, Injectable, Get, Post, Patch,
  Body, Param, Req, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CashSession, Payment, UserRole } from '../common/entities';
import { Auth, CurrentUser } from '../common/guards/roles.guard';

@Injectable()
export class CashService {
  constructor(
    @InjectRepository(CashSession) private sessionRepo: Repository<CashSession>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
  ) {}

  async getOpenSession(cashierId: string): Promise<CashSession | null> {
    return this.sessionRepo.findOne({ where: { cashierId, closedAt: null as any } });
  }

  async open(cashierId: string, openingBalance: number): Promise<CashSession> {
    const existing = await this.getOpenSession(cashierId);
    if (existing) throw new BadRequestException('Ya tienes una sesión de caja abierta');
    const session = this.sessionRepo.create({ cashierId, openingBalance, openedAt: new Date() });
    return this.sessionRepo.save(session);
  }

  async close(sessionId: string, closingBalance: number, notes?: string): Promise<CashSession> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    if (session.closedAt) throw new BadRequestException('La sesión ya está cerrada');
    session.closingBalance = closingBalance;
    session.closedAt = new Date();
    if (notes) session.notes = notes;
    return this.sessionRepo.save(session);
  }

  async getSummary(sessionId: string) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    const payments = await this.paymentRepo.find({ where: { cashSessionId: sessionId } });
    const totalIncome = payments.reduce((s, p) => s + Number(p.amountPaid), 0);
    return {
      session,
      totalIncome,
      paymentCount: payments.length,
      expectedBalance: Number(session.openingBalance) + totalIncome,
    };
  }

  async getHistory(cashierId: string) {
    return this.sessionRepo.find({
      where: { cashierId },
      order: { openedAt: 'DESC' },
      take: 30,
    });
  }
}

@ApiTags('cash')
@ApiBearerAuth()
@Controller('cash')
export class CashController {
  constructor(private cashService: CashService) {}

  @Get('session/current')
  @Auth(UserRole.ADMIN, UserRole.CAJERO)
  getCurrent(@CurrentUser('id') userId: string) {
    return this.cashService.getOpenSession(userId);
  }

  @Post('session/open')
  @Auth(UserRole.ADMIN, UserRole.CAJERO)
  open(@Body('openingBalance') amount: number, @CurrentUser('id') userId: string) {
    return this.cashService.open(userId, amount);
  }

  @Patch('session/:id/close')
  @Auth(UserRole.ADMIN, UserRole.CAJERO)
  close(
    @Param('id') id: string,
    @Body('closingBalance') amount: number,
    @Body('notes') notes?: string,
  ) {
    return this.cashService.close(id, amount, notes);
  }

  @Get('session/:id/summary')
  @Auth()
  summary(@Param('id') id: string) { return this.cashService.getSummary(id); }

  @Get('history')
  @Auth(UserRole.ADMIN, UserRole.CAJERO)
  history(@CurrentUser('id') userId: string) { return this.cashService.getHistory(userId); }
}

@Module({
  imports: [TypeOrmModule.forFeature([CashSession, Payment])],
  providers: [CashService],
  controllers: [CashController],
  exports: [CashService],
})
export class CashModule {}
