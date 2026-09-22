import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
@Entity('cliente_saldo_favor')
export class CustomerCreditBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prestamo_id' })
  loanId: string;

  @Column({ name: 'pago_id', nullable: true })
  paymentId?: string;

  @Column({ type: 'enum', enum: ['ENTRADA', 'SALIDA'] })
  tipo: 'ENTRADA' | 'SALIDA';

  @Column()
  concepto: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto: number;

  @Column({ name: 'saldo_resultante', type: 'decimal', precision: 12, scale: 2, default: 0 })
  saldoResultante: number;

  @Column({ name: 'created_by', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;
}