import {
  Module, Controller, Injectable, Post,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import * as XLSX from 'xlsx';
import {
  Loan, PaymentSchedule, Customer,
  LoanStatus, ScheduleStatus,
} from '../common/entities';
import { Auth, CurrentUser, AuthPermission } from '../common/guards/roles.guard';

interface FilaCredito {
  CURP_CLIENTE: string;
  MONTO: number;
  CUOTA_DIARIA: number;
  DIAS_PLAZO: number;
  PAGOS_REALIZADOS: number;
  FECHA_DESEMBOLSO: string;
  FECHA_PRIMER_PAGO: string;
  OBSERVACIONES?: string;
}

@Injectable()
export class ImportLoansService {
  constructor(
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    private dataSource: DataSource,
  ) {}

  // ── Días hábiles (L-V) anclados a medianoche UTC ──
  private isWeekend(d: Date): boolean {
    const w = d.getUTCDay();
    return w === 0 || w === 6;
  }
  private nextBusinessDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    do { d.setUTCDate(d.getUTCDate() + 1); } while (this.isWeekend(d));
    return d;
  }
  // Genera N fechas hábiles EMPEZANDO en la fecha dada (inclusive si es hábil)
  private businessDatesFrom(startISO: string, count: number): Date[] {
    const dates: Date[] = [];
    let cursor = new Date(`${startISO}T00:00:00Z`);
    // Si el primer pago cae en fin de semana, lo movemos al siguiente hábil
    if (this.isWeekend(cursor)) cursor = this.nextBusinessDay(cursor);
    for (let i = 0; i < count; i++) {
      dates.push(new Date(cursor));
      if (i < count - 1) cursor = this.nextBusinessDay(cursor);
    }
    return dates;
  }

  private parseDate(val: any): string | null {
    if (!val) return null;
    // Acepta Date de Excel o string AAAA-MM-DD
    if (val instanceof Date) {
      const y = val.getUTCFullYear();
      const m = String(val.getUTCMonth() + 1).padStart(2, '0');
      const d = String(val.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const s = String(val).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }

  async importFromBuffer(buffer: Buffer, userId: string) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: FilaCredito[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) throw new BadRequestException('El archivo no tiene filas de datos');

    const resultados = { creados: 0, errores: [] as any[] };

    for (let idx = 0; idx < rows.length; idx++) {
      const fila = rows[idx];
      const numFila = idx + 4; // fila real en Excel (encabezado en 3, datos desde 4)
      try {
        const curp = String(fila.CURP_CLIENTE || '').toUpperCase().trim();
        // Saltar fila de ejemplo o vacías
        if (!curp || curp.includes('CURP123456') || curp === 'CURP_CLIENTE') continue;

        const monto = Number(fila.MONTO);
        const cuota = Number(fila.CUOTA_DIARIA);
        const dias = Math.round(Number(fila.DIAS_PLAZO));
        const pagados = Math.round(Number(fila.PAGOS_REALIZADOS) || 0);
        const fDesembolso = this.parseDate(fila.FECHA_DESEMBOLSO);
        const fPrimerPago = this.parseDate(fila.FECHA_PRIMER_PAGO);

        // Validaciones
        if (!monto || monto <= 0) throw new Error('MONTO inválido');
        if (!cuota || cuota <= 0) throw new Error('CUOTA_DIARIA inválida');
        if (!dias || dias <= 0) throw new Error('DIAS_PLAZO inválido');
        if (pagados < 0 || pagados > dias) throw new Error('PAGOS_REALIZADOS fuera de rango');
        if (!fPrimerPago) throw new Error('FECHA_PRIMER_PAGO inválida (usa AAAA-MM-DD)');

        // Buscar cliente por CURP
        const cliente = await this.customerRepo.findOne({ where: { curp } });
        if (!cliente) throw new Error(`Cliente con CURP ${curp} no existe en el sistema`);

        // Crear crédito + calendario en transacción
        await this.dataSource.transaction(async (mgr) => {
          const total = Math.round(cuota * dias * 100) / 100;
          const loan = this.loanRepo.create({
            customerId:      cliente.id,
            principalAmount: monto,
            interestRate:    0,
            totalRate:       0,
            termWeeks:       dias,
            frequency:       'DIARIO',
            status:          LoanStatus.ACTIVO,
            disbursedAt:     fDesembolso ? new Date(`${fDesembolso}T00:00:00Z`) : new Date(`${fPrimerPago}T00:00:00Z`),
            disbursementMethod: 'CARGA_INICIAL',
            periodicPayment: cuota,
            totalAmount:     total,
            notes:           fila.OBSERVACIONES || 'Crédito cargado del sistema anterior',
            createdBy:       userId,
          } as any);
          const saved: Loan = await mgr.save(loan as any);

          // Generar las DIAS_PLAZO cuotas en días hábiles desde el primer pago.
          // Las primeras PAGADOS quedan como PAGADO, el resto PENDIENTE.
          const fechas = this.businessDatesFrom(fPrimerPago, dias);
          const capitalPorCuota = Math.round((monto / dias) * 100) / 100;
          const schedules = [];
          let balance = total;
          for (let i = 1; i <= dias; i++) {
            const pmt = i < dias ? cuota : Math.round(balance * 100) / 100;
            balance = Math.round(Math.max(0, balance - pmt) * 100) / 100;
            const pagada = i <= pagados;
            schedules.push(this.scheduleRepo.create({
              loanId: saved.id,
              periodNumber: i,
              dueDate: fechas[i - 1],
              principalDue: capitalPorCuota,
              interestDue: 0,
              totalDue: pmt,
              balanceDue: pagada ? 0 : pmt,
              lateInterest: 0,
              status: pagada ? ScheduleStatus.PAGADO : ScheduleStatus.PENDIENTE,
              paidAt: pagada ? fechas[i - 1] : null,
            }));
          }
          await mgr.save(schedules);
        });

        resultados.creados++;
      } catch (e: any) {
        resultados.errores.push({ fila: numFila, error: e.message });
      }
    }

    return resultados;
  }
}

@ApiTags('import-loans')
@ApiBearerAuth()
@Controller('import/loans')
export class ImportLoansController {
  constructor(private svc: ImportLoansService) {}

  @Post()
  @AuthPermission('prestamos.importar')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: any, @CurrentUser('id') userId: string) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.svc.importFromBuffer(file.buffer, userId);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Loan, PaymentSchedule, Customer])],
  providers: [ImportLoansService],
  controllers: [ImportLoansController],
  exports: [ImportLoansService],
})
export class ImportLoansModule {}