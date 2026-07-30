import {
  Module, Controller, Injectable, Get, Post, Put, Delete,
  Body, Param, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PlazoCredito } from '../common/entities';
import { Auth, AuthPermission } from '../common/guards/roles.guard';

@Injectable()
export class PlazosCreditoService {
  constructor(
    @InjectRepository(PlazoCredito) private repo: Repository<PlazoCredito>,
  ) {}

  async findAll() {
    return this.repo.find({ order: { days: 'ASC' } });
  }

  async findActive() {
    return this.repo.find({ where: { isActive: true }, order: { days: 'ASC' } });
  }

  // Resuelve el porcentaje configurado para un número de días exacto
  async getPercentageForDays(days: number): Promise<number> {
    const plazo = await this.repo.findOne({ where: { days, isActive: true } });
    if (!plazo) {
      throw new BadRequestException(
        `No hay un plazo configurado para ${days} días. Configure el plazo en el catálogo.`
      );
    }
    return Number(plazo.percentage);
  }

  async create(dto: { days: number; percentage: number; description?: string }) {
    if (!dto.days || dto.days <= 0) throw new BadRequestException('Los días deben ser mayores a 0');
    if (dto.percentage == null || dto.percentage < 0) throw new BadRequestException('Porcentaje inválido');

    const exists = await this.repo.findOne({ where: { days: dto.days } });
    if (exists) throw new BadRequestException(`Ya existe un plazo de ${dto.days} días`);

    const plazo = this.repo.create({
      days: dto.days,
      percentage: dto.percentage,
      description: dto.description || `${dto.days} días al ${(dto.percentage * 100).toFixed(0)}%`,
      isActive: true,
    });
    return this.repo.save(plazo);
  }

  async update(id: string, dto: { days?: number; percentage?: number; description?: string; isActive?: boolean }) {
    const plazo = await this.repo.findOne({ where: { id } });
    if (!plazo) throw new NotFoundException('Plazo no encontrado');

    if (dto.days != null && dto.days !== plazo.days) {
      const dup = await this.repo.findOne({ where: { days: dto.days } });
      if (dup) throw new BadRequestException(`Ya existe un plazo de ${dto.days} días`);
      plazo.days = dto.days;
    }
    if (dto.percentage != null) plazo.percentage = dto.percentage;
    if (dto.description !== undefined) plazo.description = dto.description;
    if (dto.isActive !== undefined) plazo.isActive = dto.isActive;

    return this.repo.save(plazo);
  }

  async remove(id: string) {
    const plazo = await this.repo.findOne({ where: { id } });
    if (!plazo) throw new NotFoundException('Plazo no encontrado');
    await this.repo.remove(plazo);
    return { message: 'Plazo eliminado' };
  }
}

@ApiTags('plazos-credito')
@ApiBearerAuth()
@Controller('plazos-credito')
export class PlazosCreditoController {
  constructor(private svc: PlazosCreditoService) {}

  // Lista activa — disponible para cualquier usuario autenticado (se usa al crear créditos)
  @Get() @Auth()
  findAll() { return this.svc.findActive(); }

  // Lista completa para administración
  @Get('all') @AuthPermission('config.editar')
  findAllAdmin() { return this.svc.findAll(); }

  @Post() @AuthPermission('config.editar')
  create(@Body() dto: { days: number; percentage: number; description?: string }) {
    return this.svc.create(dto);
  }

  @Put(':id') @AuthPermission('config.editar')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') @AuthPermission('config.editar')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([PlazoCredito])],
  providers: [PlazosCreditoService],
  controllers: [PlazosCreditoController],
  exports: [PlazosCreditoService],
})
export class PlazosCreditoModule {}