import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { LoanType } from './index';

@Entity('reglas_moratorio')
export class LateFeeRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => LoanType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tipo_prestamo_id' })
  loanType: LoanType;
  @Column({ name: 'tipo_prestamo_id' }) loanTypeId: string;
  @Column({ name: 'dia_desde' }) dayFrom: number;
  @Column({ name: 'dia_hasta', nullable: true }) dayTo: number;
  @Column({ name: 'tipo_cargo', default: 'FIJO' }) chargeType: 'FIJO' | 'PORCENTAJE';
  @Column({ name: 'importe', type: 'decimal', precision: 10, scale: 4 }) amount: number;
  @Column({ name: 'dias_gracia', default: 0 }) graceDays: number;
  @Column({ name: 'activo', type: 'tinyint', width: 1, default: 1, transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } }) isActive: boolean;
  @Column({ name: 'descripcion', length: 200, nullable: true }) description: string;
  @CreateDateColumn({ name: 'creado_en' }) createdAt: Date;
  @UpdateDateColumn({ name: 'actualizado_en' }) updatedAt: Date;
}
