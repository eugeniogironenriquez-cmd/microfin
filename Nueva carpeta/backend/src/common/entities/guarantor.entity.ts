import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { Loan } from './index';

@Entity('avales')
export class Guarantor {
  @PrimaryGeneratedColumn('uuid') id: string;
  @OneToOne(() => Loan)
  @JoinColumn({ name: 'prestamo_id' })
  loan: Loan;
  @Column({ name: 'prestamo_id' }) loanId: string;
  @Column({ name: 'nombre_completo', length: 150 }) fullName: string;
  @Column({ name: 'curp', length: 18 }) curp: string;
  @Column({ name: 'rfc', length: 13, nullable: true }) rfc: string;
  @Column({ name: 'telefono', length: 15 }) phone: string;
  @Column({ name: 'correo', length: 100, nullable: true }) email: string;
  @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true }) birthDate: Date;
  @Column({ name: 'domicilio', type: 'text', nullable: true }) address: string;
  @Column({ name: 'ocupacion', length: 100, nullable: true }) occupation: string;
  @Column({ name: 'ingreso_mensual', type: 'decimal', precision: 12, scale: 2, nullable: true }) monthlyIncome: number;
  @Column({ name: 'parentesco', length: 80, nullable: true }) relationship: string;
  @Column({ name: 'creado_por', nullable: true }) createdBy: string;
  @CreateDateColumn({ name: 'creado_en' }) createdAt: Date;
  @UpdateDateColumn({ name: 'actualizado_en' }) updatedAt: Date;
}
