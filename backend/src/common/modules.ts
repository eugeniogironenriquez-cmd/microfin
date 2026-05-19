// ============================================================
// USERS MODULE
// ============================================================

import {
  Module as UsersModuleDecorator, Controller as UsersController,
  Injectable as UsersInjectable, Get, Post, Put, Delete,
  Body, Param, Query, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../common/entities';
import { Auth, CurrentUser } from '../common/index';

@UsersInjectable()
export class UsersService {
  constructor(@InjectRepository(User) private userRepo: Repository<User>) {}

  async findAll(filters: { role?: string; isActive?: boolean; page?: number; limit?: number }) {
    const { page = 1, limit = 20, role, isActive } = filters;
    const qb = this.userRepo.createQueryBuilder('u')
      .select(['u.id', 'u.name', 'u.email', 'u.role', 'u.isActive', 'u.lastLoginAt', 'u.createdAt'])
      .orderBy('u.name', 'ASC')
      .skip((page - 1) * limit).take(limit);
    if (role) qb.andWhere('u.role = :role', { role });
    if (isActive !== undefined) qb.andWhere('u.isActive = :isActive', { isActive });
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({
      where: { id },
      select: ['id', 'name', 'email', 'role', 'isActive', 'lastLoginAt', 'createdAt'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(dto: { name: string; email: string; password: string; role: UserRole }) {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('El correo ya está registrado');
    const user = this.userRepo.create({
      ...dto,
      passwordHash: await bcrypt.hash(dto.password, 12),
    });
    const saved = await this.userRepo.save(user);
    const { passwordHash, refreshTokenHash, ...result } = saved as any;
    return result;
  }

  async update(id: string, dto: { name?: string; role?: UserRole; isActive?: boolean }) {
    const user = await this.findOne(id);
    Object.assign(user, dto);
    return this.userRepo.save(user);
  }

  async resetUserPassword(id: string, newPassword: string) {
    await this.findOne(id);
    await this.userRepo.update(id, { passwordHash: await bcrypt.hash(newPassword, 12) });
    return { message: 'Contraseña restablecida' };
  }

  async getCollectors() {
    return this.userRepo.find({
      where: { role: UserRole.COBRADOR, isActive: true },
      select: ['id', 'name', 'email'],
    });
  }
}

@ApiTags('users')
@ApiBearerAuth()
@UsersController('users')
export class UsersControllerClass {
  constructor(private usersService: UsersService) {}

  @Get() @Auth(UserRole.ADMIN) findAll(@Query() q: any) { return this.usersService.findAll(q); }
  @Get('collectors') @Auth(UserRole.ADMIN) getCollectors() { return this.usersService.getCollectors(); }
  @Get(':id') @Auth(UserRole.ADMIN) findOne(@Param('id') id: string) { return this.usersService.findOne(id); }
  @Post() @Auth(UserRole.ADMIN) create(@Body() dto: any) { return this.usersService.create(dto); }
  @Put(':id') @Auth(UserRole.ADMIN) update(@Param('id') id: string, @Body() dto: any) { return this.usersService.update(id, dto); }
  @Post(':id/reset-password') @Auth(UserRole.ADMIN)
  resetPassword(@Param('id') id: string, @Body('newPassword') pwd: string) { return this.usersService.resetUserPassword(id, pwd); }
}

@UsersModuleDecorator({ imports: [require('@nestjs/typeorm').TypeOrmModule.forFeature([User])], providers: [UsersService], controllers: [UsersControllerClass], exports: [UsersService] })
export class UsersModule {}

// ============================================================
// CASH MODULE - Caja
// FIX: userId → cashierId, removed non-existent 'difference' field
// ============================================================
import { Module as CashMod, Controller as CashCtrl, Injectable as CashInj, Post as CashPost, Get as CashGet, Body as CashBody, BadRequestException as CashBad } from '@nestjs/common';
import { CashSession, UserRole as UR } from '../common/entities';

@CashInj()
export class CashService {
  constructor(@InjectRepository(CashSession) private sessionRepo: Repository<CashSession>) {}

  async open(cashierId: string, openingBalance: number) {
    // FIX: campo correcto es cashierId
    const open = await this.sessionRepo.findOne({ where: { cashierId, closedAt: null as any } });
    if (open) throw new CashBad('Ya tienes una caja abierta');
    const session = this.sessionRepo.create({ cashierId, openingBalance, openedAt: new Date() });
    return this.sessionRepo.save(session);
  }

  async close(cashierId: string, closingBalance: number, notes?: string) {
    // FIX: campo correcto es cashierId
    const session = await this.sessionRepo.findOne({ where: { cashierId, closedAt: null as any } });
    if (!session) throw new CashBad('No hay caja abierta');
    session.closingBalance = closingBalance;
    session.closedAt = new Date();
    if (notes !== undefined) session.notes = notes;
    // FIX: 'difference' no existe en CashSession — se elimina
    return this.sessionRepo.save(session);
  }

  async getStatus(cashierId: string) {
    // FIX: campo correcto es cashierId
    return this.sessionRepo.findOne({ where: { cashierId, closedAt: null as any } });
  }

  async getHistory(cashierId?: string, limit = 20) {
    const qb = this.sessionRepo.createQueryBuilder('cs').orderBy('cs.openedAt', 'DESC').take(limit);
    if (cashierId) qb.where('cs.cajero_id = :cashierId', { cashierId });
    return qb.getMany();
  }

  private round(v: number) { return Math.round(v * 100) / 100; }
}

@ApiTags('cash')
@ApiBearerAuth()
@CashCtrl('cash')
export class CashController {
  constructor(private cashService: CashService) {}
  @CashGet('status') @Auth(UR.CAJERO, UR.ADMIN) status(@CurrentUser('id') id: string) { return this.cashService.getStatus(id); }
  @CashPost('open') @Auth(UR.CAJERO, UR.ADMIN) open(@CurrentUser('id') id: string, @CashBody('openingBalance') b: number) { return this.cashService.open(id, b); }
  @CashPost('close') @Auth(UR.CAJERO, UR.ADMIN) close(@CurrentUser('id') id: string, @CashBody() b: any) { return this.cashService.close(id, b.closingBalance, b.notes); }
  @CashGet('history') @Auth(UR.ADMIN) history() { return this.cashService.getHistory(); }
}

@CashMod({ imports: [require('@nestjs/typeorm').TypeOrmModule.forFeature([CashSession])], providers: [CashService], controllers: [CashController], exports: [CashService] })
export class CashModule {}

// ============================================================
// COLLECTION MODULE
// FIX: removed VisitType (no existe), assignedDate → assignedAt
// ============================================================
import { Module as ColMod, Controller as ColCtrl, Injectable as ColInj, Get as ColGet, Post as ColPost, Body as ColBody, Query as ColQuery, Param as ColParam } from '@nestjs/common';
// FIX: eliminado VisitType que no existe en entities
import { CollectorAssignment, CollectionVisit, Loan as LoanEntity, PaymentSchedule as PSEntity, ScheduleStatus as SS, LoanStatus as LS } from '../common/entities';

@ColInj()
export class CollectionService {
  constructor(
    @InjectRepository(CollectorAssignment) private assignRepo: Repository<CollectorAssignment>,
    @InjectRepository(CollectionVisit) private visitRepo: Repository<CollectionVisit>,
    @InjectRepository(LoanEntity) private loanRepo: Repository<LoanEntity>,
  ) {}

  async assign(dto: { collectorId: string; loanIds: string[]; date: string }, assignedBy: string) {
    // FIX: assignedDate → assignedAt
    const existing = await this.assignRepo.find({
      where: { collectorId: dto.collectorId, isActive: true },
    });
    for (const a of existing) { a.isActive = false; await this.assignRepo.save(a); }

    const assignments = dto.loanIds.map((loanId) =>
      this.assignRepo.create({
        collectorId: dto.collectorId,
        loanId,
        assignedAt: new Date(dto.date), // FIX: assignedAt en lugar de assignedDate
        isActive: true,
      })
    );
    return this.assignRepo.save(assignments);
  }

  async getMyClients(collectorId: string) {
    // FIX: filtrar por collectorId sin assignedDate
    const assignments = await this.assignRepo.find({
      where: { collectorId, isActive: true },
    });
    const loanIds = assignments.map((a) => a.loanId);
    if (!loanIds.length) return [];
    return this.loanRepo.createQueryBuilder('l')
      .whereInIds(loanIds)
      .leftJoinAndSelect('l.customer', 'c')
      .leftJoinAndSelect('l.paymentSchedules', 'ps')
      .getMany();
  }

  async registerVisit(dto: any, collectorId: string) {
    const visit = this.visitRepo.create({ ...dto, collectorId, visitedAt: new Date() });
    return this.visitRepo.save(visit);
  }

  async getOverdue(filters: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = filters;
    return this.loanRepo.createQueryBuilder('l')
      .where('l.estatus = :status', { status: LS.VENCIDO })
      .leftJoinAndSelect('l.customer', 'c')
      .orderBy('l.actualizado_en', 'ASC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount()
      .then(([data, total]) => ({ data, total, page, limit }));
  }
}

@ApiTags('collection')
@ApiBearerAuth()
@ColCtrl('collection')
export class CollectionController {
  constructor(private collectionService: CollectionService) {}
  @ColGet('my-clients') @Auth(UserRole.COBRADOR) getMyClients(@CurrentUser('id') id: string) { return this.collectionService.getMyClients(id); }
  @ColPost('assignments') @Auth(UserRole.ADMIN) assign(@ColBody() dto: any, @CurrentUser('id') id: string) { return this.collectionService.assign(dto, id); }
  @ColPost('visits') @Auth(UserRole.COBRADOR, UserRole.ADMIN) registerVisit(@ColBody() dto: any, @CurrentUser('id') id: string) { return this.collectionService.registerVisit(dto, id); }
  @ColGet('overdue') @Auth() getOverdue(@ColQuery() q: any) { return this.collectionService.getOverdue(q); }
}

@ColMod({ imports: [require('@nestjs/typeorm').TypeOrmModule.forFeature([CollectorAssignment, CollectionVisit, LoanEntity])], providers: [CollectionService], controllers: [CollectionController], exports: [CollectionService] })
export class CollectionModule {}

// ============================================================
// REPORTS MODULE
// ============================================================
import { Module as RepMod, Controller as RepCtrl, Injectable as RepInj, Get as RepGet, Query as RepQuery, Res, Param as RepParam } from '@nestjs/common';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';

@RepInj()
export class ReportsService {
  constructor(
    @InjectRepository(LoanEntity) private loanRepo: Repository<LoanEntity>,
    @InjectRepository(PSEntity) private scheduleRepo: Repository<PSEntity>,
  ) {}

  async getPortfolio() {
    // Usar raw SQL para evitar problemas con nombres de columnas en español
    const [result] = await this.loanRepo.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN estatus = 'ACTIVO' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN estatus = 'VENCIDO' THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN estatus = 'REESTRUCTURADO' THEN 1 ELSE 0 END) AS restructured,
        SUM(CASE WHEN estatus = 'LIQUIDADO' THEN 1 ELSE 0 END) AS settled,
        SUM(CASE WHEN estatus IN ('ACTIVO','VENCIDO') THEN monto_principal ELSE 0 END) AS totalActiveAmount
      FROM prestamos
    `);
    return {
      total:             Number(result?.total || 0),
      active:            Number(result?.active || 0),
      overdue:           Number(result?.overdue || 0),
      restructured:      Number(result?.restructured || 0),
      settled:           Number(result?.settled || 0),
      totalActiveAmount: Number(result?.totalActiveAmount || 0),
    };
  }

  async getCashFlow(startDate: string, endDate: string) {
    return this.loanRepo.createQueryBuilder('l')
      .select("DATE(l.desembolsado_en)", 'date')
      .addSelect('SUM(l.monto_principal)', 'disbursed')
      .where('l.desembolsado_en BETWEEN :start AND :end', { start: startDate, end: endDate })
      .andWhere('l.estatus != :s', { s: LS.RECHAZADO })
      .groupBy("DATE(l.desembolsado_en)")
      .orderBy("DATE(l.desembolsado_en)")
      .getRawMany();
  }

  async exportPortfolioExcel(res: Response) {
    const loans = await this.loanRepo.find({
      where: { status: LS.ACTIVO },
      relations: ['customer', 'loanType'],
      order: { createdAt: 'DESC' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Microcapital-Ixtepec';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Cartera Vigente', {
      pageSetup: { fitToPage: true, fitToWidth: 1 },
    });

    sheet.columns = [
      { header: 'ID',         key: 'id',         width: 36 },
      { header: 'Cliente',    key: 'cliente',     width: 30 },
      { header: 'CURP',       key: 'curp',        width: 20 },
      { header: 'Monto',      key: 'monto',       width: 14, style: { numFmt: '"$"#,##0.00' } },
      { header: 'Plazo',      key: 'plazo',       width: 10 },
      { header: 'Tipo',       key: 'tipo',        width: 15 },
      { header: 'Tasa',       key: 'tasa',        width: 10, style: { numFmt: '0.00%' } },
      { header: 'Cuota',      key: 'cuota',       width: 14, style: { numFmt: '"$"#,##0.00' } },
      { header: 'Desembolso', key: 'desembolso',  width: 14 },
      { header: 'Estado',     key: 'estado',      width: 14 },
    ];

    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C4532' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sheet.getRow(1).height = 25;

    loans.forEach((loan) => {
      sheet.addRow({
        id:          loan.id,
        cliente:     loan.customer?.fullName,
        curp:        loan.customer?.curp,
        monto:       Number(loan.principalAmount),
        plazo:       `${loan.termWeeks} sem`,
        tipo:        loan.loanType?.name,
        tasa:        Number(loan.interestRate),
        cuota:       Number(loan.periodicPayment),
        desembolso:  loan.disbursedAt?.toISOString().split('T')[0],
        estado:      loan.status,
      });
    });

    sheet.autoFilter = { from: 'A1', to: 'J1' };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cartera-vigente-${new Date().toISOString().split('T')[0]}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@RepCtrl('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}
  @RepGet('portfolio') @Auth() getPortfolio() { return this.reportsService.getPortfolio(); }
  @RepGet('cash-flow') @Auth() getCashFlow(@RepQuery('start') s: string, @RepQuery('end') e: string) { return this.reportsService.getCashFlow(s, e); }
  @RepGet('export/portfolio') @Auth(UserRole.ADMIN, UserRole.AUTORIZADOR)
  exportPortfolio(@Res() res: Response) { return this.reportsService.exportPortfolioExcel(res); }
}

@RepMod({ imports: [require('@nestjs/typeorm').TypeOrmModule.forFeature([LoanEntity, PSEntity])], providers: [ReportsService], controllers: [ReportsController] })
export class ReportsModule {}

// ============================================================
// SETTINGS MODULE
// ============================================================
import { Module as SetMod, Controller as SetCtrl, Injectable as SetInj, Get as SetGet, Post as SetPost, Put as SetPut, Body as SetBody, Param as SetParam } from '@nestjs/common';
import { LoanType } from '../common/entities';

@SetInj()
export class SettingsService {
  constructor(@InjectRepository(LoanType) private loanTypeRepo: Repository<LoanType>) {}
  findAllTypes() { return this.loanTypeRepo.find({ order: { name: 'ASC' } }); }
  createType(dto: Partial<LoanType>) { return this.loanTypeRepo.save(this.loanTypeRepo.create(dto)); }
  updateType(id: string, dto: Partial<LoanType>) { return this.loanTypeRepo.update(id, dto).then(() => this.loanTypeRepo.findOne({ where: { id } })); }
}

@ApiTags('settings')
@ApiBearerAuth()
@SetCtrl('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}
  @SetGet('loan-types') @Auth() getAllTypes() { return this.settingsService.findAllTypes(); }
  @SetPost('loan-types') @Auth(UserRole.ADMIN) createType(@SetBody() dto: any) { return this.settingsService.createType(dto); }
  @SetPut('loan-types/:id') @Auth(UserRole.ADMIN) updateType(@SetParam('id') id: string, @SetBody() dto: any) { return this.settingsService.updateType(id, dto); }
}

@SetMod({ imports: [require('@nestjs/typeorm').TypeOrmModule.forFeature([LoanType])], providers: [SettingsService], controllers: [SettingsController], exports: [SettingsService] })
export class SettingsModule {}