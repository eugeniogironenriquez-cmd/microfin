import {
  Module, Controller, Injectable, Get, Put,
  Body, OnModuleInit,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigMora } from '../common/entities';
import { Auth, AuthPermission } from '../common/guards/roles.guard';

@Injectable()
export class ConfigMoraService implements OnModuleInit {
  constructor(
    @InjectRepository(ConfigMora) private repo: Repository<ConfigMora>,
  ) {}

  // Asegura que exista la fila de configuración al arrancar
  async onModuleInit() {
    const existing = await this.repo.findOne({ where: { id: 1 } });
    if (!existing) {
      await this.repo.save(this.repo.create({ id: 1, moraPorDia: 50 }));
    }
  }

  async get(): Promise<ConfigMora> {
    let cfg = await this.repo.findOne({ where: { id: 1 } });
    if (!cfg) {
      cfg = await this.repo.save(this.repo.create({ id: 1, moraPorDia: 50 }));
    }
    return cfg;
  }

  // Monto de mora por día (para cálculos)
  async getMoraPorDia(): Promise<number> {
    const cfg = await this.get();
    return Number(cfg.moraPorDia);
  }

  async update(dto: { moraPorDia: number }): Promise<ConfigMora> {
    const cfg = await this.get();
    cfg.moraPorDia = dto.moraPorDia;
    return this.repo.save(cfg);
  }

  // Calcula la mora total de un crédito según sus cuotas vencidas.
  // mora = (suma de días hábiles de atraso de cada cuota pendiente) * moraPorDia
  // Días hábiles de atraso se calculan en día-calendario de México (UTC-6).
  businessDaysOverdue(dueDate: Date, today: Date): number {
    const MX = 6 * 60 * 60 * 1000;
    const dueDay = new Date(new Date(dueDate).getTime() - MX);
    let cursor = Date.UTC(dueDay.getUTCFullYear(), dueDay.getUTCMonth(), dueDay.getUTCDate());
    const todayDay = new Date(today.getTime() - MX);
    const end = Date.UTC(todayDay.getUTCFullYear(), todayDay.getUTCMonth(), todayDay.getUTCDate());

    let count = 0;
    // Contar días hábiles transcurridos DESPUÉS del vencimiento hasta hoy
    while (cursor < end) {
      cursor += 24 * 60 * 60 * 1000;
      const d = new Date(cursor);
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) count++;
    }
    return count;
  }
}

@ApiTags('config-mora')
@ApiBearerAuth()
@Controller('config-mora')
export class ConfigMoraController {
  constructor(private svc: ConfigMoraService) {}

  // Cualquier usuario autenticado puede leer la mora (se usa al pagar)
  @Get() @Auth()
  get() { return this.svc.get(); }

  @Put() @AuthPermission('config.editar')
  update(@Body() dto: { moraPorDia: number }) { return this.svc.update(dto); }
}

@Module({
  imports: [TypeOrmModule.forFeature([ConfigMora])],
  providers: [ConfigMoraService],
  controllers: [ConfigMoraController],
  exports: [ConfigMoraService],
})
export class ConfigMoraModule {}