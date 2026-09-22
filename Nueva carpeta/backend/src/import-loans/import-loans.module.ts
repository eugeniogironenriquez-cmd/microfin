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
import { GuarantorModule, GuarantorService } from '../guarantor/guarantor.module';
import { ConfigMoraModule, ConfigMoraService } from '../config-mora/config-mora.module';

interface FilaCredito {
  CURP_CLIENTE: string;
  NOMBRE_AVAL?: string;
  CURP_AVAL?: string;
  TELEFONO_AVAL?: string;
  MONTO: number;
  CUOTA_DIARIA: number;
  DIAS_PLAZO: number;
  PAGOS_REALIZADOS: number;
  FECHA_DESEMBOLSO: string;
  FECHA_PRIMER_PAGO: string;
  FECHA_ULTIMO_PAGO?: string;
  TOTAL_MORATORIO?: number;
  OBSERVACIONES?: string;
}

@Injectable()
export class ImportLoansService {
  constructor(
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(PaymentSchedule) private scheduleRepo: Repository<PaymentSchedule>,
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    private dataSource: DataSource,
    private guarantorService: GuarantorService,
    private moraService: ConfigMoraService,
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
  private businessDatesFrom(startISO: string, count: number): Date[] {
    const dates: Date[] = [];
    let cursor = new Date(`${startISO}T00:00:00Z`);
    if (this.isWeekend(cursor)) cursor = this.nextBusinessDay(cursor);
    for (let i = 0; i < count; i++) {
      dates.push(new Date(cursor));
      if (i < count - 1) cursor = this.nextBusinessDay(cursor);
    }
    return dates;
  }

  private parseDate(val: any): string | null {
    if (!val) return null;
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

  private round(n: number): number { return Math.round(n * 100) / 100; }

  async importFromBuffer(buffer: Buffer, userId: string) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];

    // Layout: fila 1 = título, fila 2 = instrucciones, fila 3 = encabezados,
    // datos desde la fila 4 (range: 3 en base 0). Encabezados explícitos en el
    // MISMO orden que el Excel de carga.
    const headers = [
      'CURP_CLIENTE', 'NOMBRE_AVAL', 'CURP_AVAL', 'TELEFONO_AVAL',
      'MONTO', 'CUOTA_DIARIA', 'DIAS_PLAZO', 'PAGOS_REALIZADOS',
      'FECHA_DESEMBOLSO', 'FECHA_PRIMER_PAGO', 'FECHA_ULTIMO_PAGO',
      'TOTAL_MORATORIO', 'OBSERVACIONES',
    ];
    const rows: FilaCredito[] = XLSX.utils.sheet_to_json(sheet, {
      header: headers as any,
      range: 3,
      defval: '',
    });

    if (!rows.length) throw new BadRequestException('El archivo no tiene filas de datos');

    const moraPorDia = await this.moraService.getMoraPorDia();
    const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
    const resultados = { creados: 0, errores: [] as any[] };

    for (let idx = 0; idx < rows.length; idx++) {
      const fila = rows[idx];
      const numFila = idx + 4;
      try {
        const curp = String(fila.CURP_CLIENTE || '').toUpperCase().trim();
        if (!curp || curp.includes('CURP123456') || curp === 'CURP_CLIENTE') continue;
        // Saltar la fila de ejemplo (trae "Ejemplo - borrar" en observaciones)
        if (String(fila.OBSERVACIONES || '').toLowerCase().includes('ejemplo')) continue;

        const monto = Number(fila.MONTO);
        const cuota = Number(fila.CUOTA_DIARIA);
        const dias = Math.round(Number(fila.DIAS_PLAZO));
        const pagados = Math.round(Number(fila.PAGOS_REALIZADOS) || 0);
        const fDesembolso = this.parseDate(fila.FECHA_DESEMBOLSO);
        const fPrimerPago = this.parseDate(fila.FECHA_PRIMER_PAGO);
        const fUltimoPago = this.parseDate(fila.FECHA_ULTIMO_PAGO);
        const totalMoratorio = Number(fila.TOTAL_MORATORIO) || 0;

        if (!monto || monto <= 0) throw new Error('MONTO inválido');
        if (!cuota || cuota <= 0) throw new Error('CUOTA_DIARIA inválida');
        if (!dias || dias <= 0) throw new Error('DIAS_PLAZO inválido');
        if (pagados < 0 || pagados > dias) throw new Error('PAGOS_REALIZADOS fuera de rango');
        if (!fPrimerPago) throw new Error('FECHA_PRIMER_PAGO inválida (usa AAAA-MM-DD)');
        if (totalMoratorio < 0) throw new Error('TOTAL_MORATORIO no puede ser negativo');

        const cliente = await this.customerRepo.findOne({ where: { curp } });
        if (!cliente) throw new Error(`Cliente con CURP ${curp} no existe en el sistema`);

        let savedLoanId = '';

        await this.dataSource.transaction(async (mgr) => {
          const total = this.round(cuota * dias);
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
          savedLoanId = saved.id;

          const fechas = this.businessDatesFrom(fPrimerPago, dias);
          const capitalPorCuota = this.round(monto / dias);
          const schedules: PaymentSchedule[] = [];
          let balance = total;
          for (let i = 1; i <= dias; i++) {
            const pmt = i < dias ? cuota : this.round(balance);
            balance = this.round(Math.max(0, balance - pmt));
            const pagada = i <= pagados;
            // La última cuota pagada usa FECHA_ULTIMO_PAGO si viene; el resto su fecha de vencimiento
            const paidAt = pagada
              ? (i === pagados && fUltimoPago ? new Date(`${fUltimoPago}T00:00:00Z`) : fechas[i - 1])
              : null;
            schedules.push(this.scheduleRepo.create({
              loanId: saved.id,
              periodNumber: i,
              dueDate: fechas[i - 1],
              principalDue: capitalPorCuota,
              interestDue: 0,
              totalDue: pmt,
              balanceDue: pagada ? 0 : pmt,
              lateInterest: 0,
              moraGenerada: 0,
              moraPagada: 0,
              status: pagada ? ScheduleStatus.PAGADO : ScheduleStatus.PENDIENTE,
              paidAt,
            }) as PaymentSchedule);
          }

          // ── Estampar la MORA INICIAL (TOTAL_MORATORIO) ──
          // Se distribuye entre las cuotas pendientes YA vencidas (dueDate < hoy),
          // usando moraPorDia por cuota, hasta agotar el total. El resto se ajusta
          // en la última cuota vencida para que el total coincida exacto.
          if (totalMoratorio > 0) {
            const vencidasPendientes = schedules.filter(
              (s) => s.status !== ScheduleStatus.PAGADO && s.dueDate < hoy,
            );
            if (vencidasPendientes.length > 0) {
              let restante = totalMoratorio;
              for (let k = 0; k < vencidasPendientes.length; k++) {
                if (restante <= 0) break;
                const esUltima = k === vencidasPendientes.length - 1;
                // A cada cuota le toca moraPorDia, salvo la última que absorbe el resto
                const monto = esUltima ? this.round(restante) : this.round(Math.min(moraPorDia, restante));
                vencidasPendientes[k].moraGenerada = monto;
                restante = this.round(restante - monto);
              }
              // Si el total era mayor que (nº vencidas × moraPorDia), la última cuota
              // absorbe todo el excedente (queda con más mora). Si era menor, se reparte
              // hasta agotarlo y las cuotas restantes quedan en 0.
            }
            // Si no hay cuotas vencidas pendientes pero sí viene mora, se estampa en la
            // primera cuota pendiente (caso borde: mora arrastrada sin cuota vencida aún).
            else {
              const primeraPendiente = schedules.find((s) => s.status !== ScheduleStatus.PAGADO);
              if (primeraPendiente) primeraPendiente.moraGenerada = this.round(totalMoratorio);
            }
          }

          await mgr.save(schedules);

          // Si tras la carga hay cuotas vencidas, el crédito nace VENCIDO
          const tieneVencidas = schedules.some(
            (s) => s.status !== ScheduleStatus.PAGADO && s.dueDate < hoy,
          );
          if (tieneVencidas) {
            await mgr.update(Loan, saved.id, { status: LoanStatus.VENCIDO });
          }
        });

        // ── Crear el AVAL si vienen los datos ──
        const nombreAval = String(fila.NOMBRE_AVAL || '').trim();
        const curpAval = String(fila.CURP_AVAL || '').toUpperCase().trim();
        if (savedLoanId && nombreAval && curpAval) {
          try {
            await this.guarantorService.upsert(savedLoanId, {
              fullName: nombreAval,
              curp: curpAval,
              phone: String(fila.TELEFONO_AVAL || '').trim() || undefined,
            } as any, userId);
          } catch (avalErr: any) {
            // No abortar el crédito por un fallo de aval; reportar como advertencia
            resultados.errores.push({ fila: numFila, error: `Crédito creado, pero el aval falló: ${avalErr.message}` });
          }
        }

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
  imports: [
    TypeOrmModule.forFeature([Loan, PaymentSchedule, Customer]),
    GuarantorModule, ConfigMoraModule,
  ],
  providers: [ImportLoansService],
  controllers: [ImportLoansController],
  exports: [ImportLoansService],
})
export class ImportLoansModule {}
