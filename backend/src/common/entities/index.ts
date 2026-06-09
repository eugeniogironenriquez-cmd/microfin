// ============================================================
// ENTIDADES — ORDEN CORRECTO SIN REFERENCIAS CIRCULARES
// Orden: enums → tablas base → tablas dependientes → tablas hoja
// ============================================================


import {
  Entity, PrimaryColumn, PrimaryGeneratedColumn, Column,
  CreateDateColumn,UpdateDateColumn, ManyToOne, ManyToMany,OneToMany, JoinColumn,OneToOne, JoinTable,
} from 'typeorm';

// ─── ENUMS ────────────────────────────────────────────────────
export enum UserRole {
  ADMIN         = 'ADMIN',
  CAJERO        = 'CAJERO',
  AUTORIZADOR   = 'AUTORIZADOR',
  COBRADOR      = 'COBRADOR',
}
export enum LoanStatus {
  SOLICITUD      = 'SOLICITUD',
  AUTORIZADO     = 'AUTORIZADO',
  RECHAZADO      = 'RECHAZADO',
  ACTIVO         = 'ACTIVO',
  VENCIDO        = 'VENCIDO',
  REESTRUCTURADO = 'REESTRUCTURADO',
  LIQUIDADO      = 'LIQUIDADO',
  CASTIGADO      = 'CASTIGADO',
  CONVENIO       = 'CONVENIO',   // <-- AGREGAR
}
 
export enum ScheduleStatus {
  PENDIENTE = 'PENDIENTE',
  PAGADO    = 'PAGADO',
  PARCIAL   = 'PARCIAL',
  VENCIDO   = 'VENCIDO',
}
export enum PaymentMethod {
  EFECTIVO      = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  TARJETA       = 'TARJETA',
}
export enum PaymentSource {
  CAJA          = 'CAJA',
  COBRADOR      = 'COBRADOR',
  TRANSFERENCIA = 'TRANSFERENCIA',
}
export enum SyncStatus {
  PENDIENTE = 'PENDIENTE',
  SYNCED    = 'SYNCED',
  ERROR     = 'ERROR',
}
export enum CustomerStatus {
  ACTIVO      = 'ACTIVO',
  INACTIVO    = 'INACTIVO',
  LISTA_NEGRA = 'LISTA_NEGRA',
}

// ============================================================
// ENTIDADES DEL SISTEMA DE ROLES Y PERMISOS
// Agregar al final de common/entities/index.ts
// ============================================================


// ─── ROL ──────────────────────────────────────────────────────
@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre', length: 50, unique: true })
  name: string;

  @Column({ name: 'descripcion', length: 255, nullable: true })
  description: string;

  @Column({ name: 'es_sistema', type: 'tinyint', width: 1, default: 0,
    transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isSystem: boolean;

  @Column({ name: 'es_admin', type: 'tinyint', width: 1, default: 0,
    transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isAdmin: boolean;

  @Column({ name: 'activo', type: 'tinyint', width: 1, default: 1,
    transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isActive: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @ManyToMany(() => Permiso, { eager: true })
  @JoinTable({
    name: 'roles_permisos',
    joinColumn: { name: 'rol_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permiso_clave', referencedColumnName: 'key' },
  })
  permissions: Permiso[];
}

// ─── PERMISO (catálogo) ───────────────────────────────────────
@Entity('permisos')
export class Permiso {
  @PrimaryColumn({ name: 'clave', length: 60 })
  key: string;

  @Column({ name: 'modulo', length: 50 })
  module: string;

  @Column({ name: 'accion', length: 50 })
  action: string;
}

// ─── 1. USUARIOS ─────────────────────────────────────────────
@Entity('usuarios')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre', length: 150 })
  name: string;

  @Column({ name: 'correo', length: 100, unique: true })
  email: string;

  @Column({ name: 'contrasena_hash' })
  passwordHash: string;

  @Column({ name: 'rol', type: 'enum', enum: UserRole, default: UserRole.CAJERO })
  role: UserRole;

    @Column({ name: 'rol_id', nullable: true })
  roleId: string;
 
  @ManyToOne(() => Role, { eager: true })
  @JoinColumn({ name: 'rol_id' })
  roleEntity: Role;

  @Column({ name: 'activo', type: 'tinyint', width: 1, default: 1,
    transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isActive: boolean;

  @Column({ name: 'ultimo_acceso', nullable: true })
  lastLoginAt: Date;

  @Column({ name: 'token_refresco', nullable: true })
  refreshTokenHash: string | undefined;

  @Column({ name: 'token_reset', nullable: true })
  passwordResetToken: string | undefined;

  @Column({ name: 'expira_reset', nullable: true })
  passwordResetExpires: Date | undefined;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;
}

// ─── 2. ESTADOS ──────────────────────────────────────────────
@Entity('estados')
export class State {
  @PrimaryGeneratedColumn('increment', { type: 'smallint', unsigned: true })
  id: number;

  @Column({ name: 'clave', length: 5 })
  code: string;

  @Column({ name: 'nombre', length: 100 })
  name: string;

  @OneToMany(() => Municipality, (m) => m.state)
  municipalities: Municipality[];
}

// ─── 3. MUNICIPIOS ───────────────────────────────────────────
@Entity('municipios')
export class Municipality {
  @PrimaryGeneratedColumn('increment', { type: 'smallint', unsigned: true })
  id: number;

  @ManyToOne(() => State, (s) => s.municipalities)
  @JoinColumn({ name: 'estado_id' })
  state: State;

  @Column({ name: 'estado_id', type: 'smallint', unsigned: true })
  stateId: number;

  @Column({ name: 'nombre', length: 150 })
  name: string;
}

// ─── 4. CLIENTES ─────────────────────────────────────────────
@Entity('clientes')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'curp', length: 18, unique: true })
  curp: string;

  @Column({ name: 'rfc', length: 13, nullable: true })
  rfc: string;

  @Column({ name: 'nombre_completo', length: 150 })
  fullName: string;

  @Column({ name: 'telefono', length: 15 })
  phone: string;

  @Column({ name: 'correo', nullable: true, length: 100 })
  email: string;

  @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
  birthDate: Date;

  @Column({ name: 'domicilio', type: 'json', nullable: true })
  address: {
    street: string; colonia: string; municipality: string;
    state: string; zip: string; references?: string;
  };

  @Column({ name: 'referencias', type: 'json', nullable: true })
  references: Array<{ name: string; phone: string; relationship: string }>;

  @Column({ name: 'estado_id', type: 'smallint', unsigned: true, nullable: true })
  stateId: number;

  @Column({ name: 'municipio_id', type: 'smallint', unsigned: true, nullable: true })
  municipalityId: number;

  @Column({ name: 'estatus', type: 'enum', enum: CustomerStatus, default: CustomerStatus.ACTIVO })
  status: CustomerStatus;

  @Column({ name: 'ocupacion', nullable: true, length: 100 })
  occupation: string;

  @Column({ name: 'giro_negocio', nullable: true, length: 100 })
  businessType: string;

  @Column({ name: 'giro_otro', nullable: true, length: 150 })
  businessTypeOther: string;

  @Column({ name: 'foto_ruta', nullable: true, length: 500 })
  photoPath: string;

  @Column({ name: 'ingreso_mensual', type: 'decimal', precision: 12, scale: 2, nullable: true })
  monthlyIncome: number;
 
  @Column({ name: 'ingreso_diario', type: 'decimal', precision: 12, scale: 2, nullable: true })
  dailyIncome: number;

  @Column({ name: 'notas', type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'creado_por', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;

  @OneToMany(() => Loan, (loan) => loan.customer)
  loans: Loan[];

  @OneToMany(() => CustomerDocument, (doc) => doc.customer)
  documents: CustomerDocument[];
}

// ─── 5. DOCUMENTOS DEL CLIENTE ───────────────────────────────
@Entity('documentos_cliente')
export class CustomerDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Customer, (c) => c.documents)
  @JoinColumn({ name: 'cliente_id' })
  customer: Customer;

  @Column({ name: 'cliente_id' })
  customerId: string;

  @Column({ name: 'tipo_documento', length: 50 })
  docType: string;

  @Column({ name: 'ruta_archivo' })
  filePath: string;

  @Column({ name: 'nombre_original' })
  originalName: string;

  @Column({ name: 'subido_por' })
  uploadedBy: string;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;
}

// ─── 6. TIPOS DE PRÉSTAMO ─────────────────────────────────────
@Entity('tipos_prestamo')
export class LoanType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre', length: 100 })
  name: string;

  @Column({ name: 'tasa_default', type: 'decimal', precision: 6, scale: 4 })
  defaultRate: number;

  @Column({ name: 'tasa_minima', type: 'decimal', precision: 6, scale: 4 })
  minRate: number;

  @Column({ name: 'tasa_maxima', type: 'decimal', precision: 6, scale: 4 })
  maxRate: number;

  @Column({ name: 'monto_minimo', type: 'decimal', precision: 12, scale: 2 })
  minAmount: number;

  @Column({ name: 'monto_maximo', type: 'decimal', precision: 12, scale: 2 })
  maxAmount: number;

  @Column({ name: 'plazo_minimo_semanas', default: 1 })
  minTermWeeks: number;

  @Column({ name: 'plazo_maximo_semanas', default: 52 })
  maxTermWeeks: number;

  @Column({ name: 'frecuencia', default: 'SEMANAL' })
  frequency: string;

  @Column({ name: 'dias_periodo', default: 7 })
  periodDays: number;

  @Column({ name: 'unidad_periodo', default: 'SEMANAS' })
  periodUnit: string;

  @Column({ name: 'dias_gracia', default: 0 })
  graceDays: number;

  @Column({ name: 'activo', type: 'tinyint', width: 1, default: 1,
    transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isActive: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;
}

// ─── 7. AVALES (antes que Loan porque Loan los referencia) ────
@Entity('avales')
export class Guarantor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prestamo_id' })
  loanId: string;

  @Column({ name: 'nombre_completo', length: 150 })
  fullName: string;

  @Column({ name: 'curp', length: 18 })
  curp: string;

  @Column({ name: 'rfc', length: 13, nullable: true })
  rfc: string;

  @Column({ name: 'telefono', length: 15 })
  phone: string;

  @Column({ name: 'correo', length: 100, nullable: true })
  email: string;

  @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
  birthDate: Date;

  @Column({ name: 'domicilio', type: 'text', nullable: true })
  address: string;

  @Column({ name: 'ocupacion', length: 100, nullable: true })
  occupation: string;

  @Column({ name: 'ingreso_mensual', type: 'decimal', precision: 12, scale: 2, nullable: true })
  monthlyIncome: number;

  @Column({ name: 'parentesco', length: 80, nullable: true })
  relationship: string;

  @Column({ name: 'creado_por', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;
}

// ─── 8. PRÉSTAMOS ────────────────────────────────────────────
@Entity('prestamos')
export class Loan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Customer, (c) => c.loans)
  @JoinColumn({ name: 'cliente_id' })
  customer: Customer;

  @Column({ name: 'cliente_id' })
  customerId: string;

  @ManyToOne(() => LoanType, { nullable: true })
  @JoinColumn({ name: 'tipo_prestamo_id' })
  loanType: LoanType;
 
  @Column({ name: 'tipo_prestamo_id', nullable: true })
  loanTypeId: string;

  @Column({ name: 'prestamo_padre_id', nullable: true })
  parentLoanId: string;

  @Column({ name: 'monto_principal', type: 'decimal', precision: 12, scale: 2 })
  principalAmount: number;

  @Column({ name: 'tasa_interes', type: 'decimal', precision: 6, scale: 4 })
  interestRate: number;

  @Column({ name: 'tasa_total', type: 'decimal', precision: 6, scale: 4, nullable: true, default: null })
  totalRate: number;

  @Column({ name: 'plazo_semanas' })
  termWeeks: number;

  @Column({ name: 'frecuencia', default: 'SEMANAL' })
  frequency: string;

  @Column({ name: 'estatus', type: 'enum', enum: LoanStatus, default: LoanStatus.SOLICITUD })
  status: LoanStatus;

  @Column({ name: 'monto_total', type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalAmount: number;

  @Column({ name: 'pago_periodico', type: 'decimal', precision: 12, scale: 2, nullable: true })
  periodicPayment: number;

  @Column({ name: 'autorizado_por', nullable: true })
  authorizedBy: string;

  @Column({ name: 'autorizado_en', nullable: true })
  authorizedAt: Date;

  @Column({ name: 'razon_rechazo', nullable: true })
  rejectionReason: string;

  @Column({ name: 'desembolsado_en', nullable: true })
  disbursedAt: Date;

  @Column({ name: 'forma_desembolso', nullable: true })
  disbursementMethod: string;

  @Column({ name: 'desembolsado_por', nullable: true })
  disbursedBy: string;

  @Column({ name: 'razon_reestructura', nullable: true })
  restructureReason: string;

  @Column({ name: 'contador_reestructuras', default: 0 })
  restructureCount: number;

  @Column({ name: 'es_convenio', type: 'tinyint', width: 1, default: 0,
  transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isConvenio: boolean;

  @Column({ name: 'cobrador_id', nullable: true })
  collectorId: string;

  @Column({ name: 'notas', type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'creado_por', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;

  @OneToMany(() => PaymentSchedule, (s) => s.loan)
  paymentSchedules: PaymentSchedule[];

  @OneToMany(() => Payment, (p) => p.loan)
  payments: Payment[];


}

// ─── 9. CALENDARIO DE PAGOS ──────────────────────────────────
@Entity('calendario_pagos')
export class PaymentSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Loan, (l) => l.paymentSchedules)
  @JoinColumn({ name: 'prestamo_id' })
  loan: Loan;

  @Column({ name: 'prestamo_id' })
  loanId: string;

  @Column({ name: 'numero_periodo' })
  periodNumber: number;

  @Column({ name: 'fecha_vencimiento', type: 'date' })
  dueDate: Date;

  @Column({ name: 'capital_adeudado', type: 'decimal', precision: 12, scale: 2 })
  principalDue: number;

  @Column({ name: 'interes_adeudado', type: 'decimal', precision: 12, scale: 2 })
  interestDue: number;

  @Column({ name: 'total_adeudado', type: 'decimal', precision: 12, scale: 2 })
  totalDue: number;

  @Column({ name: 'saldo_adeudado', type: 'decimal', precision: 12, scale: 2 })
  balanceDue: number;

  @Column({ name: 'interes_moratorio', type: 'decimal', precision: 12, scale: 2, default: 0 })
  lateInterest: number;

  @Column({ name: 'estatus', type: 'enum', enum: ScheduleStatus, default: ScheduleStatus.PENDIENTE })
  status: ScheduleStatus;

  @Column({ name: 'pagado_en', nullable: true })
  paidAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;
}

// ─── 10. SESIONES DE CAJA ────────────────────────────────────
@Entity('sesiones_caja')
export class CashSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cajero_id' })
  cashierId: string;

  @Column({ name: 'saldo_apertura', type: 'decimal', precision: 12, scale: 2 })
  openingBalance: number;

  @Column({ name: 'saldo_cierre', type: 'decimal', precision: 12, scale: 2, nullable: true })
  closingBalance: number;

  @Column({ name: 'abierta_en' })
  openedAt: Date;

  @Column({ name: 'cerrada_en', nullable: true })
  closedAt: Date;

  @Column({ name: 'notas', type: 'text', nullable: true })
  notes: string | undefined;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;
}

// ─── 11. PAGOS ───────────────────────────────────────────────
@Entity('pagos')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Loan, (l) => l.payments)
  @JoinColumn({ name: 'prestamo_id' })
  loan: Loan;

  @Column({ name: 'prestamo_id' })
  loanId: string;

  @Column({ name: 'cobrador_id', nullable: true })
  collectorId: string;

  @Column({ name: 'sesion_caja_id', nullable: true })
  cashSessionId: string;

  @Column({ name: 'monto_pagado', type: 'decimal', precision: 12, scale: 2 })
  amountPaid: number;

  @Column({ name: 'capital_aplicado', type: 'decimal', precision: 12, scale: 2, default: 0 })
  capitalApplied: number;

  @Column({ name: 'interes_aplicado', type: 'decimal', precision: 12, scale: 2, default: 0 })
  interestApplied: number;

  @Column({ name: 'moratorio_aplicado', type: 'decimal', precision: 12, scale: 2, default: 0 })
  lateInterestApplied: number;

  @Column({ name: 'fecha_pago', type: 'date' })
  paymentDate: Date;

  @Column({ name: 'forma_pago', type: 'enum', enum: PaymentMethod, default: PaymentMethod.EFECTIVO })
  method: PaymentMethod;

  @Column({ name: 'fuente', type: 'enum', enum: PaymentSource, default: PaymentSource.CAJA })
  source: PaymentSource;

  @Column({ name: 'referencia', nullable: true })
  reference: string | undefined;

  @Column({ name: 'numero_comprobante', nullable: true })
  receiptNumber: string;

  @Column({ name: 'geolocalizacion', nullable: true })
  geolocation: string | undefined;

  @Column({ name: 'lat', type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat?: number | null;

  @Column({ name: 'lng', type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng?: number | null;


  @Column({ name: 'id_local', nullable: true })
  localId: string | undefined;

  @Column({ name: 'estatus_sync', type: 'enum', enum: SyncStatus, default: SyncStatus.SYNCED })
  syncStatus: SyncStatus;

  @Column({ name: 'notas', nullable: true })
  notes: string | undefined;

  @Column({ name: 'creado_por' })
  createdBy: string;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;
}

// ─── 12. VISITAS DE COBRANZA ──────────────────────────────────
@Entity('visitas_cobranza')
export class CollectionVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prestamo_id' })
  loanId: string;

  @Column({ name: 'cobrador_id' })
  collectorId: string;

  @Column({ name: 'tipo_visita', length: 50 })
  visitType: string;

  @Column({ name: 'resultado', length: 100, nullable: true })
  result: string;

  @Column({ name: 'notas', type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'geolocalizacion', nullable: true })
  geolocation: string;

  @Column({ name: 'visitado_en' })
  visitedAt: Date;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;
}

// ─── 13. ASIGNACIONES DE COBRADOR ─────────────────────────────
@Entity('asignaciones_cobrador')
export class CollectorAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cobrador_id' })
  collectorId: string;

  @Column({ name: 'prestamo_id' })
  loanId: string;

  @Column({ name: 'asignado_en' })
  assignedAt: Date;

  @Column({ name: 'activo', type: 'tinyint', width: 1, default: 1,
    transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isActive: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;
}

// ─── 14. BITÁCORA ─────────────────────────────────────────────
@Entity('bitacora_auditoria')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', nullable: true })
  userId: string;

  @Column({ name: 'accion', length: 100 })
  action: string;

  @Column({ name: 'entidad', length: 100 })
  entity: string;

  @Column({ name: 'entidad_id', nullable: true })
  entityId: string;

  @Column({ name: 'datos_anteriores', type: 'json', nullable: true })
  oldData: any;

  @Column({ name: 'datos_nuevos', type: 'json', nullable: true })
  newData: any;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress: string;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;
}

// ─── 15. CONFIGURACIÓN EMPRESA ────────────────────────────────
@Entity('configuracion_empresa')
export class CompanySettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre', length: 150 })
  name: string;

  @Column({ name: 'rfc', length: 13, nullable: true })
  rfc: string;

  @Column({ name: 'domicilio', type: 'text', nullable: true })
  address: string;

  @Column({ name: 'telefono', length: 20, nullable: true })
  phone: string;

  @Column({ name: 'correo', length: 100, nullable: true })
  email: string;

  @Column({ name: 'sitio_web', length: 200, nullable: true })
  website: string;

  @Column({ name: 'ruta_logo', nullable: true })
  logoPath: string;

  @Column({ name: 'regimen_fiscal', length: 100, nullable: true })
  fiscalRegime: string;

  @Column({ name: 'ciudad', length: 100, nullable: true })
  city: string;

  @Column({ name: 'estado', length: 100, nullable: true })
  state: string;

  @Column({ name: 'codigo_postal', length: 10, nullable: true })
  zip: string;

  @Column({ name: 'pie_legal', type: 'text', nullable: true })
  legalFooter: string;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;
}

// ─── 16. REGLAS DE MORATORIO ──────────────────────────────────
@Entity('reglas_moratorio')
export class LateFeeRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LoanType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tipo_prestamo_id' })
  loanType: LoanType;

  @Column({ name: 'tipo_prestamo_id' })
  loanTypeId: string;

  @Column({ name: 'dia_desde' })
  dayFrom: number;

  @Column({ name: 'dia_hasta', nullable: true })
  dayTo: number;

  @Column({ name: 'tipo_cargo', default: 'FIJO' })
  chargeType: 'FIJO' | 'PORCENTAJE';

  @Column({ name: 'importe', type: 'decimal', precision: 10, scale: 4 })
  amount: number;

  @Column({ name: 'dias_gracia', default: 0 })
  graceDays: number;

  @Column({ name: 'activo', type: 'tinyint', width: 1, default: 1,
    transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isActive: boolean;

  @Column({ name: 'descripcion', length: 200, nullable: true })
  description: string;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;
}

// ─── 17. CATEGORÍAS DE GASTO ──────────────────────────────────
@Entity('categorias_gasto')
export class ExpenseCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre', length: 100 })
  name: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'activo', type: 'tinyint', width: 1, default: 1,
    transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isActive: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @OneToMany(() => Expense, (e) => e.category)
  expenses: Expense[];
}

// ─── 18. GASTOS OPERATIVOS ────────────────────────────────────
@Entity('gastos')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ExpenseCategory, (c) => c.expenses)
  @JoinColumn({ name: 'categoria_id' })
  category: ExpenseCategory;

  @Column({ name: 'categoria_id' })
  categoryId: string;

  @Column({ name: 'sesion_caja_id', nullable: true })
  cashSessionId: string;

  @Column({ name: 'monto', type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'descripcion', type: 'text' })
  description: string;

  @Column({ name: 'fecha_gasto', type: 'date' })
  expenseDate: Date;

  @Column({ name: 'forma_pago', type: 'enum', enum: PaymentMethod, default: PaymentMethod.EFECTIVO })
  method: PaymentMethod;

  @Column({ name: 'comprobante_ruta', nullable: true })
  receiptPath: string;

  @Column({ name: 'registrado_por' })
  createdBy: string;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;
}

// ─── RANGOS DE TASA ───────────────────────────────────────────
@Entity('rangos_tasa')
export class RangoTasa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LoanType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tipo_prestamo_id' })
  loanType: LoanType;

  @Column({ name: 'tipo_prestamo_id' })
  loanTypeId: string;

  @Column({ name: 'monto_minimo', type: 'decimal', precision: 12, scale: 2 })
  minAmount: number;

  @Column({ name: 'monto_maximo', type: 'decimal', precision: 12, scale: 2 })
  maxAmount: number;

  @Column({ name: 'tasa_total', type: 'decimal', precision: 6, scale: 4 })
  totalRate: number;

  @Column({ name: 'periodos', type: 'json' })
  periods: number[];

  @Column({ name: 'activo', type: 'tinyint', width: 1, default: 1,
    transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isActive: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;
}

// ─── PLAZOS DE CRÉDITO (días -> porcentaje) ───────────────────
// Agregar al final de common/entities/index.ts
@Entity('plazos_credito')
export class PlazoCredito {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dias', type: 'int', unique: true })
  days: number;

  @Column({ name: 'porcentaje', type: 'decimal', precision: 6, scale: 4 })
  percentage: number;

  @Column({ name: 'descripcion', length: 150, nullable: true })
  description: string;

  @Column({ name: 'activo', type: 'tinyint', width: 1, default: 1,
    transformer: { to: (v: boolean) => v ? 1 : 0, from: (v: any) => Boolean(v) } })
  isActive: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;
}

// ─── CONFIGURACIÓN GLOBAL DE MORA ─────────────────────────────
// Agregar al final de common/entities/index.ts
@Entity('config_mora')
export class ConfigMora {
  @PrimaryGeneratedColumn('increment')
  id: number;
 
  @Column({ name: 'mora_por_dia', type: 'decimal', precision: 12, scale: 2, default: 50 })
  moraPorDia: number;
 
  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;
}
 
// ─── CONFIGURACIÓN DEL SEMÁFORO DE CARTERA ────────────────────
// Agregar al final de common/entities/index.ts
@Entity('config_semaforo')
export class ConfigSemaforo {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'verde_hasta', type: 'int', default: 0 })
  greenUpTo: number;       // cuotas vencidas hasta este num = verde

  @Column({ name: 'amarillo_hasta', type: 'int', default: 5 })
  yellowUpTo: number;      // hasta este num = amarillo; mas = rojo

  @UpdateDateColumn({ name: 'actualizado_en' })
  updatedAt: Date;
}

// ─── HISTORIAL DE COMPORTAMIENTO DE PAGO ──────────────────────
@Entity('historial_comportamiento')
export class HistorialComportamiento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cliente_id' })
  customerId: string;

  @Column({ name: 'prestamo_id' })
  loanId: string;

  @Column({ name: 'nivel', length: 10 })
  level: string;           // AMARILLO | ROJO

  @Column({ name: 'cuotas_vencidas', type: 'int', default: 0 })
  overdueCount: number;

  @CreateDateColumn({ name: 'registrado_en' })
  recordedAt: Date;
}