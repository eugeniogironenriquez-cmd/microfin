import {
  Module, Controller, Injectable, Get, Post,
  Body, Param, Query,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CollectionVisit, CollectorAssignment, Loan, LoanStatus, UserRole } from '../common/entities';
import { Auth, CurrentUser } from '../common/guards/roles.guard';

@Injectable()
export class CollectionService {
  constructor(
    @InjectRepository(CollectionVisit) private visitRepo: Repository<CollectionVisit>,
    @InjectRepository(CollectorAssignment) private assignRepo: Repository<CollectorAssignment>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
  ) {}

  async getMyLoans(collectorId: string) {
    return this.loanRepo.createQueryBuilder('l')
      .leftJoinAndSelect('l.customer', 'c')
      .leftJoinAndSelect('l.loanType', 'lt')
      .where('l.cobrador_id = :collectorId', { collectorId })
      .andWhere('l.estatus IN (:...statuses)', { statuses: [LoanStatus.ACTIVO, LoanStatus.VENCIDO] })
      .getMany();
  }

  async registerVisit(dto: {
    loanId: string; collectorId: string; visitType: string;
    result?: string; notes?: string; geolocation?: string;
  }): Promise<CollectionVisit> {
    const visit = this.visitRepo.create({ ...dto, visitedAt: new Date() });
    return this.visitRepo.save(visit);
  }

  async assign(loanId: string, collectorId: string): Promise<CollectorAssignment> {
    // Desactivar asignación anterior
    await this.assignRepo.update({ loanId, isActive: true }, { isActive: false });
    // Actualizar cobrador en préstamo
    await this.loanRepo.update(loanId, { collectorId });
    const assignment = this.assignRepo.create({ loanId, collectorId, assignedAt: new Date() });
    return this.assignRepo.save(assignment);
  }

  async getVisits(loanId: string) {
    return this.visitRepo.find({ where: { loanId }, order: { visitedAt: 'DESC' } });
  }
}

@ApiTags('collection')
@ApiBearerAuth()
@Controller('collection')
export class CollectionController {
  constructor(private collectionService: CollectionService) {}

  @Get('my-loans')
  @Auth(UserRole.COBRADOR, UserRole.ADMIN)
  getMyLoans(@CurrentUser('id') userId: string) {
    return this.collectionService.getMyLoans(userId);
  }

  @Post('visits')
  @Auth(UserRole.COBRADOR, UserRole.ADMIN)
  registerVisit(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.collectionService.registerVisit({ ...dto, collectorId: userId });
  }

  @Get('visits/:loanId')
  @Auth()
  getVisits(@Param('loanId') loanId: string) {
    return this.collectionService.getVisits(loanId);
  }

  @Post('assign')
  @Auth(UserRole.ADMIN)
  assign(@Body() dto: { loanId: string; collectorId: string }) {
    return this.collectionService.assign(dto.loanId, dto.collectorId);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([CollectionVisit, CollectorAssignment, Loan])],
  providers: [CollectionService],
  controllers: [CollectionController],
  exports: [CollectionService],
})
export class CollectionModule {}
