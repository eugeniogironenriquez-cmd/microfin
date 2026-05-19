import {
  Module, Controller, Injectable, Get, Post, Put, Patch,
  Body, Param, NotFoundException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LoanType, UserRole } from '../common/entities';
import { Auth } from '../common/guards/roles.guard';

@Injectable()
export class SettingsService {
  constructor(@InjectRepository(LoanType) private loanTypeRepo: Repository<LoanType>) {}

  findAllLoanTypes(): Promise<LoanType[]> {
    return this.loanTypeRepo.find({ order: { name: 'ASC' } });
  }

  async findOneLoanType(id: string): Promise<LoanType> {
    const t = await this.loanTypeRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Tipo de préstamo no encontrado');
    return t;
  }

  async createLoanType(dto: Partial<LoanType>): Promise<LoanType> {
    const t = this.loanTypeRepo.create(dto);
    return this.loanTypeRepo.save(t);
  }

  async updateLoanType(id: string, dto: Partial<LoanType>): Promise<LoanType> {
    const t = await this.findOneLoanType(id);
    Object.assign(t, dto);
    return this.loanTypeRepo.save(t);
  }

  async toggleActive(id: string): Promise<LoanType> {
    const t = await this.findOneLoanType(id);
    t.isActive = !t.isActive;
    return this.loanTypeRepo.save(t);
  }
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get('loan-types')
  @Auth()
  findAllLoanTypes() { return this.settingsService.findAllLoanTypes(); }

  @Get('loan-types/:id')
  @Auth()
  findOne(@Param('id') id: string) { return this.settingsService.findOneLoanType(id); }

  @Post('loan-types')
  @Auth(UserRole.ADMIN)
  createLoanType(@Body() dto: Partial<LoanType>) { return this.settingsService.createLoanType(dto); }

  @Put('loan-types/:id')
  @Auth(UserRole.ADMIN)
  updateLoanType(@Param('id') id: string, @Body() dto: Partial<LoanType>) {
    return this.settingsService.updateLoanType(id, dto);
  }

  @Patch('loan-types/:id/toggle')
  @Auth(UserRole.ADMIN)
  toggleActive(@Param('id') id: string) { return this.settingsService.toggleActive(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([LoanType])],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
