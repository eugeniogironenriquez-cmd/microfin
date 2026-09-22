import {
  Module, Controller, Injectable, Get, Post, Put, Delete,
  Body, Param, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LateFeeRule, LoanType, UserRole } from '../common/entities';
import { Auth } from '../common/guards/roles.guard';

export class CreateLateFeeRuleDto {
  loanTypeId: string;
  dayFrom: number;
  dayTo?: number;
  chargeType: 'FIJO' | 'PORCENTAJE';
  amount: number;
  graceDays?: number;
  description?: string;
}

@Injectable()
export class LateFeeRulesService {
  constructor(
    @InjectRepository(LateFeeRule) private ruleRepo: Repository<LateFeeRule>,
    @InjectRepository(LoanType) private loanTypeRepo: Repository<LoanType>,
  ) {}

  async findByLoanType(loanTypeId: string): Promise<LateFeeRule[]> {
    return this.ruleRepo.find({
      where: { loanTypeId, isActive: true },
      order: { dayFrom: 'ASC' },
    });
  }

  async findAll(): Promise<LateFeeRule[]> {
    return this.ruleRepo.find({
      relations: ['loanType'],
      order: { loanTypeId: 'ASC', dayFrom: 'ASC' },
    });
  }

  async create(dto: CreateLateFeeRuleDto): Promise<LateFeeRule> {
    const loanType = await this.loanTypeRepo.findOne({ where: { id: dto.loanTypeId } });
    if (!loanType) throw new NotFoundException('Tipo de préstamo no encontrado');

    if (dto.chargeType === 'PORCENTAJE' && dto.amount > 1)
      throw new BadRequestException('El porcentaje debe ser decimal (ej: 0.05 = 5%)');

    const rule = this.ruleRepo.create(dto);
    return this.ruleRepo.save(rule);
  }

  async update(id: string, dto: Partial<CreateLateFeeRuleDto>): Promise<LateFeeRule> {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Regla no encontrada');
    Object.assign(rule, dto);
    return this.ruleRepo.save(rule);
  }

  async remove(id: string): Promise<{ message: string }> {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Regla no encontrada');
    rule.isActive = false;
    await this.ruleRepo.save(rule);
    return { message: 'Tramo eliminado' };
  }

  async calculateLateFee(
    loanTypeId: string,
    overdueBalance: number,
    dueDate: Date,
    today: Date = new Date(),
  ): Promise<{ daysLate: number; feeAmount: number; breakdown: any[] }> {
    const daysLate = Math.max(
      0,
      Math.floor((today.getTime() - new Date(dueDate).getTime()) / 86400000),
    );

    if (daysLate <= 0) return { daysLate: 0, feeAmount: 0, breakdown: [] };

    const rules = await this.findByLoanType(loanTypeId);
    if (!rules.length) return { daysLate, feeAmount: 0, breakdown: [] };

    let totalFee = 0;
    const breakdown: any[] = [];

    for (let day = 1; day <= daysLate; day++) {
      const rule = rules.find(
        (r) => day >= r.dayFrom && (r.dayTo === null || day <= Number(r.dayTo)),
      );
      if (!rule || day <= (rule.graceDays || 0)) continue;

      const dailyCharge = rule.chargeType === 'FIJO'
        ? Number(rule.amount)
        : Number(overdueBalance) * Number(rule.amount);

      const rounded = Math.round(dailyCharge * 100) / 100;
      totalFee += rounded;
      breakdown.push({ day, chargeType: rule.chargeType, dailyCharge: rounded });
    }

    return { daysLate, feeAmount: Math.round(totalFee * 100) / 100, breakdown };
  }
}

@ApiTags('late-fee-rules')
@ApiBearerAuth()
@Controller('late-fee-rules')
export class LateFeeRulesController {
  constructor(private service: LateFeeRulesService) {}

  @Get() @Auth() findAll() { return this.service.findAll(); }

  @Get('loan-type/:id') @Auth()
  findByLoanType(@Param('id') id: string) { return this.service.findByLoanType(id); }

  @Post() @Auth(UserRole.ADMIN)
  create(@Body() dto: CreateLateFeeRuleDto) { return this.service.create(dto); }

  @Put(':id') @Auth(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: Partial<CreateLateFeeRuleDto>) {
    return this.service.update(id, dto);
  }

  @Delete(':id') @Auth(UserRole.ADMIN)
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([LateFeeRule, LoanType])],
  providers: [LateFeeRulesService],
  controllers: [LateFeeRulesController],
  exports: [LateFeeRulesService],
})
export class LateFeeRulesModule {}
