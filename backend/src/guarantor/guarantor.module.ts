import {
  Module, Controller, Injectable, Get, Post, Put,
  Body, Param, NotFoundException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Guarantor, Loan, UserRole } from '../common/entities';
import { Auth, CurrentUser } from '../common/guards/roles.guard';

@Injectable()
export class GuarantorService {
  constructor(
    @InjectRepository(Guarantor) private repo: Repository<Guarantor>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
  ) {}

  async findByLoan(loanId: string): Promise<Guarantor | null> {
    return this.repo.findOne({ where: { loanId } });
  }

  async upsert(loanId: string, dto: Partial<Guarantor>, userId: string): Promise<Guarantor> {
    const loan = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');

    const existing = await this.repo.findOne({ where: { loanId } });
    if (existing) {
      Object.assign(existing, dto);
      return this.repo.save(existing);
    }

    const guarantor = this.repo.create({ ...dto, loanId, createdBy: userId });
    return this.repo.save(guarantor);
  }
}

@ApiTags('guarantors')
@ApiBearerAuth()
@Controller('loans/:loanId/guarantor')
export class GuarantorController {
  constructor(private guarantorService: GuarantorService) {}

  @Get()
  @Auth()
  findByLoan(@Param('loanId') loanId: string) {
    return this.guarantorService.findByLoan(loanId);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.CAJERO)
  upsert(
    @Param('loanId') loanId: string,
    @Body() dto: Partial<Guarantor>,
    @CurrentUser('id') userId: string,
  ) {
    return this.guarantorService.upsert(loanId, dto, userId);
  }

  @Put()
  @Auth(UserRole.ADMIN, UserRole.CAJERO)
  update(
    @Param('loanId') loanId: string,
    @Body() dto: Partial<Guarantor>,
    @CurrentUser('id') userId: string,
  ) {
    return this.guarantorService.upsert(loanId, dto, userId);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Guarantor, Loan])],
  providers: [GuarantorService],
  controllers: [GuarantorController],
  exports: [GuarantorService],
})
export class GuarantorModule {}
