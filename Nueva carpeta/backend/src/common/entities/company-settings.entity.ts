import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('configuracion_empresa')
export class CompanySettings {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'nombre', length: 150 }) name: string;
  @Column({ name: 'rfc', length: 13, nullable: true }) rfc: string;
  @Column({ name: 'domicilio', type: 'text', nullable: true }) address: string;
  @Column({ name: 'telefono', length: 20, nullable: true }) phone: string;
  @Column({ name: 'correo', length: 100, nullable: true }) email: string;
  @Column({ name: 'sitio_web', length: 200, nullable: true }) website: string;
  @Column({ name: 'ruta_logo', nullable: true }) logoPath: string;
  @Column({ name: 'regimen_fiscal', length: 100, nullable: true }) fiscalRegime: string;
  @Column({ name: 'ciudad', length: 100, nullable: true }) city: string;
  @Column({ name: 'estado', length: 100, nullable: true }) state: string;
  @Column({ name: 'codigo_postal', length: 10, nullable: true }) zip: string;
  @Column({ name: 'pie_legal', type: 'text', nullable: true }) legalFooter: string;
  @CreateDateColumn({ name: 'creado_en' }) createdAt: Date;
  @UpdateDateColumn({ name: 'actualizado_en' }) updatedAt: Date;
}
