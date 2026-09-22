import {
  Module, Controller, Injectable, Get, Post, Put,
  Body, Param, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Guarantor, Loan, LoanStatus, UserRole } from '../common/entities';
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

  // ── VALIDACIÓN DE AVAL ÚNICO POR CURP ────────────────────────
  // Un aval no puede estar en más de un crédito ACTIVO o VENCIDO a la vez.
  // Se excluye el crédito actual (para permitir editar el mismo aval).
  async assertCurpAvailable(curp: string, currentLoanId: string): Promise<void> {
    const cleanCurp = (curp || '').toUpperCase().trim();
    if (!cleanCurp) return;

    // Buscar todos los avales con esta CURP en OTROS créditos
    const avales = await this.repo.find({
      where: { curp: cleanCurp, loanId: Not(currentLoanId) },
    });
    if (avales.length === 0) return;

    // Revisar si alguno de esos créditos está ACTIVO o VENCIDO
    const loanIds = avales.map(a => a.loanId);
    const activos = await this.loanRepo.find({
      where: loanIds.map(id => ({ id, status: LoanStatus.ACTIVO as any })),
    });
    const vencidos = await this.loanRepo.find({
      where: loanIds.map(id => ({ id, status: LoanStatus.VENCIDO as any })),
    });

    const bloqueantes = [...activos, ...vencidos];
    if (bloqueantes.length > 0) {
      throw new BadRequestException(
        `Esta persona (CURP ${cleanCurp}) ya es aval de otro crédito activo o vencido. ` +
        `Un aval no puede respaldar más de un crédito a la vez.`
      );
    }
  }

  async upsert(loanId: string, dto: Partial<Guarantor>, userId: string): Promise<Guarantor> {
    const loan = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');

    // Validar aval único por CURP antes de guardar
    if (dto.curp) {
      await this.assertCurpAvailable(dto.curp, loanId);
    }

    const existing = await this.repo.findOne({ where: { loanId } });
    if (existing) {
      Object.assign(existing, dto);
      if (dto.curp) existing.curp = String(dto.curp).toUpperCase().trim();
      return this.repo.save(existing);
    }

    const guarantor = this.repo.create({
      ...dto,
      curp: dto.curp ? String(dto.curp).toUpperCase().trim() : dto.curp,
      loanId,
      createdBy: userId,
    });
    return this.repo.save(guarantor);
  }

  // ── EDICIÓN DE DATOS DEL AVAL (feature 8) ────────────────────
  // Permite actualizar datos de contacto sin re-validar la CURP
  // (a menos que cambie la CURP misma).
  async updateData(loanId: string, dto: Partial<Guarantor>): Promise<Guarantor> {
    const existing = await this.repo.findOne({ where: { loanId } });
    if (!existing) throw new NotFoundException('Este crédito no tiene aval registrado');

    // Si cambia la CURP, validar que la nueva esté disponible
    if (dto.curp && String(dto.curp).toUpperCase().trim() !== existing.curp) {
      await this.assertCurpAvailable(dto.curp, loanId);
      existing.curp = String(dto.curp).toUpperCase().trim();
    }

    // Campos editables de contacto/datos
    if (dto.fullName     !== undefined) existing.fullName = dto.fullName;
    if (dto.phone        !== undefined) existing.phone = dto.phone;
    if (dto.email        !== undefined) existing.email = dto.email;
    if (dto.address      !== undefined) existing.address = dto.address;
    if (dto.relationship !== undefined) existing.relationship = dto.relationship;
    if (dto.occupation   !== undefined) existing.occupation = dto.occupation;
    if (dto.rfc          !== undefined) existing.rfc = dto.rfc ? String(dto.rfc).toUpperCase().trim() : dto.rfc;

    return this.repo.save(existing);
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
    return this.guarantorService.updateData(loanId, dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Guarantor, Loan])],
  providers: [GuarantorService],
  controllers: [GuarantorController],
  exports: [GuarantorService],
})
export class GuarantorModule {}