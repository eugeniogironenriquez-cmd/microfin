import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { PaymentMethod } from './index';

@Entity('categorias_gasto')
export class ExpenseCategory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'nombre', length: 100 }) name: string;
  @Column({ name: 'descripcion', type: 'text', nullable: true }) description: string;
  @Column({ name: 'activo', type: 'tinyint', width: 1, default: 1, transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } }) isActive: boolean;
  @CreateDateColumn({ name: 'creado_en' }) createdAt: Date;
  @OneToMany(() => Expense, (e) => e.category) expenses: Expense[];
}

@Entity('gastos')
export class Expense {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => ExpenseCategory)
  @JoinColumn({ name: 'categoria_id' })
  category: ExpenseCategory;
  @Column({ name: 'categoria_id' }) categoryId: string;
  @Column({ name: 'sesion_caja_id', nullable: true }) cashSessionId: string;
  @Column({ name: 'monto', type: 'decimal', precision: 12, scale: 2 }) amount: number;
  @Column({ name: 'descripcion', type: 'text' }) description: string;
  @Column({ name: 'fecha_gasto', type: 'date' }) expenseDate: Date;
  @Column({ name: 'forma_pago', type: 'enum', enum: PaymentMethod, default: PaymentMethod.EFECTIVO }) method: PaymentMethod;
  @Column({ name: 'comprobante_ruta', nullable: true }) receiptPath: string;
  @Column({ name: 'registrado_por' }) createdBy: string;
  @CreateDateColumn({ name: 'creado_en' }) createdAt: Date;
}
