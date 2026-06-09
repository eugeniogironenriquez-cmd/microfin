import {
  Module, Controller, Injectable, Get, Post,
  Body, Param, Query, NotFoundException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Repository,
} from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../common/guards/roles.guard';

// ── ENTIDAD ───────────────────────────────────────────────────
export type TipoVisita = 'NO_LOCALIZADO' | 'PROMESA_PAGO';

@Entity('visitas')
export class Visita {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ name: 'prestamo_id', type: 'varchar', length: 36 })
  loanId!: string;

  @Column({ type: 'enum', enum: ['NO_LOCALIZADO', 'PROMESA_PAGO'] })
  tipo!: TipoVisita;

  @Column({ type: 'text', nullable: true })
  notas?: string | null;

  @Column({ name: 'fecha_promesa', type: 'date', nullable: true })
  fechaPromesa?: string | null;

  @Column({ name: 'monto_promesa', type: 'decimal', precision: 12, scale: 2, nullable: true })
  montoPromesa?: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat?: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng?: number | null;

  @Column({ name: 'id_local', type: 'varchar', length: 64, nullable: true })
  localId?: string | null;

  @Column({ name: 'registrado_por', type: 'varchar', length: 36 })
  registradoPor!: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;
}

// ── DTO ───────────────────────────────────────────────────────
interface RegistrarVisitaDto {
  loanId: string;
  tipo: TipoVisita;
  notas?: string;
  fechaPromesa?: string;   // 'YYYY-MM-DD'
  montoPromesa?: number;
  lat?: number;
  lng?: number;
  localId?: string;
}

// ── SERVICE ───────────────────────────────────────────────────
@Injectable()
export class VisitasService {
  constructor(
    @InjectRepository(Visita) private repo: Repository<Visita>,
  ) {}

  async registrar(dto: RegistrarVisitaDto, userId: string) {
    // Idempotencia: si ya existe una visita con este localId, devolverla
    if (dto.localId) {
      const existing = await this.repo.findOne({ where: { localId: dto.localId } });
      if (existing) return { visita: existing, duplicate: true };
    }

    const visita = this.repo.create({
      id: this.uuid(),
      loanId: dto.loanId,
      tipo: dto.tipo,
      notas: dto.notas || null,
      // Los campos de promesa solo se guardan si el tipo es PROMESA_PAGO
      fechaPromesa: dto.tipo === 'PROMESA_PAGO' ? (dto.fechaPromesa || null) : null,
      montoPromesa: dto.tipo === 'PROMESA_PAGO' ? (dto.montoPromesa ?? null) : null,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      localId: dto.localId || null,
      registradoPor: userId,
    });
    const saved = await this.repo.save(visita);
    return { visita: saved };
  }

  // Visitas de un crédito (historial)
  async porPrestamo(loanId: string) {
    return this.repo.find({
      where: { loanId },
      order: { creadoEn: 'DESC' },
    });
  }

  // Visitas con geolocalización para el monitor web (por día)
  // Incluye nombre del cliente y del cobrador/gestor que registró.
  async geoDelDia(date?: string) {
    const day = date ? new Date(date) : new Date();
    day.setHours(0, 0, 0, 0);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);

    // Join manual por SQL para traer nombres (cliente y usuario que registró)
    const rows = await this.repo.query(
      `SELECT v.id, v.prestamo_id AS loanId, v.tipo, v.notas,
              v.fecha_promesa AS fechaPromesa, v.monto_promesa AS montoPromesa,
              v.lat, v.lng, v.registrado_por AS registradoPor, v.creado_en AS creadoEn,
              c.nombre_completo AS customerName,
              u.nombre AS collectorName
       FROM visitas v
       LEFT JOIN prestamos p ON p.id = v.prestamo_id
       LEFT JOIN clientes  c ON c.id = p.cliente_id
       LEFT JOIN usuarios  u ON u.id = v.registrado_por
       WHERE v.creado_en >= ? AND v.creado_en < ? AND v.lat IS NOT NULL
       ORDER BY v.creado_en DESC`,
      [day, next]
    );

    return rows.map((v: any) => ({
      id: v.id,
      loanId: v.loanId,
      tipo: v.tipo,
      lat: Number(v.lat),
      lng: Number(v.lng),
      notas: v.notas,
      fechaPromesa: v.fechaPromesa,
      montoPromesa: v.montoPromesa != null ? Number(v.montoPromesa) : null,
      customerName: v.customerName,
      collectorName: v.collectorName,
      registradoPor: v.registradoPor,
      creadoEn: v.creadoEn,
    }));
  }

  private uuid(): string {
    return require('crypto').randomUUID();
  }
}

// ── CONTROLLER ───────────────────────────────────────────────
@ApiTags('visitas')
@ApiBearerAuth()
@Controller('visitas')
export class VisitasController {
  constructor(private svc: VisitasService) {}

  // Registrar visita (cobrador/gestor)
  @Post() @Auth()
  registrar(@Body() dto: RegistrarVisitaDto, @CurrentUser('id') userId: string) {
    return this.svc.registrar(dto, userId);
  }

  // Historial de visitas de un crédito
  @Get('prestamo/:loanId') @Auth()
  porPrestamo(@Param('loanId') loanId: string) {
    return this.svc.porPrestamo(loanId);
  }

  // Geolocalización de visitas para el monitor web
  @Get('geo') @Auth()
  geo(@Query('date') date?: string) {
    return this.svc.geoDelDia(date);
  }
}

// ── MODULE ───────────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([Visita])],
  providers: [VisitasService],
  controllers: [VisitasController],
  exports: [VisitasService],
})
export class VisitasModule {}
