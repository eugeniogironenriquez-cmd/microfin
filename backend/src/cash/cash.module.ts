import {
  Module, Controller, Injectable, Get, Post, Patch,
  Body, Param, Req, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
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
    return this.sessionRepo.findOne({ where: { cashierId, closedAt: IsNull() } });
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

  // ─── Alias que usa el frontend web (rutas simplificadas) ───
  // El frontend llama /cash/status, /cash/open y /cash/close (sin /session/
  // ni id). Estos endpoints delegan en la misma lógica.

  @Get('status')
  @Auth(UserRole.ADMIN, UserRole.CAJERO)
  status(@CurrentUser('id') userId: string) {
    return this.cashService.getOpenSession(userId);
  }

  @Post('open')
  @Auth(UserRole.ADMIN, UserRole.CAJERO)
  openAlias(@Body('openingBalance') amount: number, @CurrentUser('id') userId: string) {
    return this.cashService.open(userId, amount);
  }

  @Post('close')
  @Auth(UserRole.ADMIN, UserRole.CAJERO)
  async closeAlias(
    @Body('closingBalance') amount: number,
    @Body('notes') notes: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    // El frontend no envía el id de sesión: se cierra la sesión abierta del usuario.
    const session = await this.cashService.getOpenSession(userId);
    if (!session) {
      throw new BadRequestException('No hay una caja abierta para cerrar');
    }
    return this.cashService.close(session.id, amount, notes);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([CashSession, Payment])],
  providers: [CashService],
  controllers: [CashController],
  exports: [CashService],
})
export class CashModule {}