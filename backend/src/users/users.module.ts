import {
  Module, Controller, Injectable, Get, Post, Put, Patch,
  Body, Param, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { User, UserRole, Role } from '../common/entities';
import { Auth, AuthPermission } from '../common/guards/roles.guard';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Role) private roleRepo: Repository<Role>,
  ) {}

  // Serializa el usuario sin el hash y con su rol
  private serialize(u: User): any {
    const roleEntity: Role | undefined = (u as any).roleEntity;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: (u as any).role,          // enum legacy
      roleId: (u as any).roleId || null,
      roleName: roleEntity?.name || (u as any).role || null,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    };
  }

  async findAll() {
    const users = await this.userRepo.find({ order: { name: 'ASC' } });
    return users.map(u => this.serialize(u));
  }

  async findOne(id: string): Promise<any> {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return this.serialize(u);
  }

  async create(dto: { name: string; email: string; password: string; roleId?: string; role?: UserRole }): Promise<any> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('El correo ya está registrado');
    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    // Resolver el rol: por roleId (nuevo) o por enum role (compatibilidad)
    let roleId = dto.roleId;
    let roleEnum: UserRole | undefined = dto.role;
    if (roleId) {
      const role = await this.roleRepo.findOne({ where: { id: roleId } });
      if (!role) throw new BadRequestException('Rol no válido');
      // Sincronizar el enum legacy con el nombre del rol si coincide
      if (['ADMIN','CAJERO','AUTORIZADOR','COBRADOR'].includes(role.name)) {
        roleEnum = role.name as UserRole;
      } else {
        roleEnum = UserRole.CAJERO; // rol personalizado → enum base por defecto
      }
    }

    const hash = await bcrypt.hash(dto.password, 12);
    const u: User = this.userRepo.create({
      name: dto.name,
      email: dto.email,
      passwordHash: hash,
      role: roleEnum || UserRole.CAJERO,
      ...(roleId ? { roleId } : {}),
    } as Partial<User>) as User;
    const saved: User = await this.userRepo.save(u);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: Partial<{ name: string; roleId: string; role: UserRole; isActive: boolean }>): Promise<any> {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuario no encontrado');

    if (dto.name) u.name = dto.name;

    // Aceptar isActive por PUT también (además del endpoint /toggle)
    if (dto.isActive !== undefined) {
      u.isActive = Boolean(dto.isActive);
    }

    if (dto.roleId) {
      const role = await this.roleRepo.findOne({ where: { id: dto.roleId } });
      if (!role) throw new BadRequestException('Rol no válido');
      (u as any).roleId = dto.roleId;
      // IMPORTANTE: la columna rol_id está mapeada como @Column (roleId) Y como
      // @JoinColumn de la relación roleEntity (eager). Si solo cambiamos roleId,
      // TypeORM usa la relación roleEntity (con el valor viejo cargado por eager)
      // al guardar y sobrescribe el cambio. Por eso sincronizamos la relación.
      (u as any).roleEntity = role;
      // Mantener enum legacy sincronizado
      if (['ADMIN','CAJERO','AUTORIZADOR','COBRADOR'].includes(role.name)) {
        (u as any).role = role.name;
      }
    } else if (dto.role) {
      (u as any).role = dto.role;
    }

    await this.userRepo.save(u);
    return this.findOne(id);
  }

  async resetPassword(id: string, newPassword: string): Promise<{ message: string }> {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    u.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.save(u);
    return { message: 'Contraseña restablecida' };
  }

  async toggleActive(id: string): Promise<any> {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    u.isActive = !u.isActive;
    await this.userRepo.save(u);
    return this.findOne(id);
  }

  async getCollectors(): Promise<any[]> {
    // Cobradores: por enum legacy O por rol cuyo nombre sea COBRADOR
    const users = await this.userRepo.find({
      where: { role: UserRole.COBRADOR, isActive: true },
      order: { name: 'ASC' },
    });
    return users.map(u => this.serialize(u));
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get() @AuthPermission('usuarios.ver')
  findAll() { return this.usersService.findAll(); }

  @Get('collectors') @Auth()
  getCollectors() { return this.usersService.getCollectors(); }

  @Get(':id') @AuthPermission('usuarios.ver')
  findOne(@Param('id') id: string) { return this.usersService.findOne(id); }

  @Post() @AuthPermission('usuarios.crear')
  create(@Body() dto: { name: string; email: string; password: string; roleId?: string; role?: UserRole }) {
    return this.usersService.create(dto);
  }

  @Put(':id') @AuthPermission('usuarios.crear')
  update(@Param('id') id: string, @Body() dto: Partial<{ name: string; roleId: string; role: UserRole; isActive: boolean }>) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/reset-password') @AuthPermission('usuarios.crear')
  resetPassword(@Param('id') id: string, @Body('password') password: string) {
    return this.usersService.resetPassword(id, password);
  }

  @Patch(':id/toggle') @AuthPermission('usuarios.crear')
  toggleActive(@Param('id') id: string) { return this.usersService.toggleActive(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([User, Role])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}