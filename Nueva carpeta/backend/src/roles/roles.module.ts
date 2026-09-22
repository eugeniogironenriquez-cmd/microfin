import {
  Module, Controller, Injectable, Get, Post, Put, Delete,
  Body, Param, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, Permiso } from '../common/entities';
import { Auth, AuthPermission, CurrentUser } from '../common/guards/roles.guard';

// ── SERVICE ──────────────────────────────────────────────────
@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    @InjectRepository(Permiso) private permisoRepo: Repository<Permiso>,
  ) {}

  // Listar todos los roles con conteo de permisos
  async findAll() {
    const roles = await this.roleRepo.find({ order: { createdAt: 'ASC' } });
    return roles.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isAdmin: r.isAdmin,
      isActive: r.isActive,
      permissionCount: r.isAdmin ? 'TODOS' : (r.permissions?.length || 0),
      permissionKeys: r.isAdmin ? [] : (r.permissions || []).map(p => p.key),
    }));
  }

  // Detalle de un rol con sus permisos
  async findOne(id: string) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isAdmin: role.isAdmin,
      isActive: role.isActive,
      permissions: role.permissions || [],
      permissionKeys: (role.permissions || []).map(p => p.key),
    };
  }

  // Catálogo completo de permisos (agrupado por módulo)
  async getAllPermissions() {
    const permisos = await this.permisoRepo.find();
    return permisos;
  }

  // Crear un rol nuevo
  async create(dto: { name: string; description?: string; permissionKeys?: string[] }) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('El nombre del rol es obligatorio');

    const exists = await this.roleRepo.findOne({ where: { name } });
    if (exists) throw new BadRequestException('Ya existe un rol con ese nombre');

    const role = this.roleRepo.create({
      name,
      description: dto.description || '',
      isSystem: false,
      isAdmin: false,
      isActive: true,
    });

    // Asignar permisos
    if (dto.permissionKeys && dto.permissionKeys.length > 0) {
      role.permissions = await this.permisoRepo.find({
        where: { key: In(dto.permissionKeys) },
      });
    } else {
      role.permissions = [];
    }

    const saved = await this.roleRepo.save(role);
    return this.findOne(saved.id);
  }

  // Editar un rol (nombre, descripción y permisos)
  async update(id: string, dto: { name?: string; description?: string; permissionKeys?: string[]; isActive?: boolean }) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado');

    // No se puede cambiar el nombre de un rol de sistema
    if (role.isSystem && dto.name && dto.name.trim() !== role.name) {
      throw new ForbiddenException('No se puede renombrar un rol base del sistema');
    }

    if (dto.name && !role.isSystem) role.name = dto.name.trim();
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.isActive !== undefined && !role.isSystem) role.isActive = dto.isActive;

    // El super admin no puede quedarse sin permisos: siempre tiene todos
    if (!role.isAdmin && dto.permissionKeys !== undefined) {
      role.permissions = dto.permissionKeys.length > 0
        ? await this.permisoRepo.find({ where: { key: In(dto.permissionKeys) } })
        : [];
    }

    await this.roleRepo.save(role);
    return this.findOne(id);
  }

  // Eliminar un rol (solo si no es de sistema y no tiene usuarios)
  async remove(id: string) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (role.isSystem) throw new ForbiddenException('No se puede eliminar un rol base del sistema');

    // Verificar que no haya usuarios con este rol
    const count = await this.roleRepo.manager.query(
      'SELECT COUNT(*) as cnt FROM usuarios WHERE rol_id = ?', [id]
    );
    if (Number(count?.[0]?.cnt || 0) > 0) {
      throw new BadRequestException('No se puede eliminar: hay usuarios con este rol asignado');
    }

    await this.roleRepo.remove(role);
    return { message: 'Rol eliminado' };
  }
}

// ── CONTROLLER ───────────────────────────────────────────────
@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @AuthPermission('roles.ver')
  @ApiOperation({ summary: 'Listar todos los roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('permissions')
  @AuthPermission('roles.ver')
  @ApiOperation({ summary: 'Catálogo de permisos disponibles' })
  getAllPermissions() {
    return this.rolesService.getAllPermissions();
  }

  @Get(':id')
  @AuthPermission('roles.ver')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @AuthPermission('roles.gestionar')
  @ApiOperation({ summary: 'Crear un nuevo rol' })
  create(@Body() dto: { name: string; description?: string; permissionKeys?: string[] }) {
    return this.rolesService.create(dto);
  }

  @Put(':id')
  @AuthPermission('roles.gestionar')
  @ApiOperation({ summary: 'Editar rol y sus permisos' })
  update(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string; permissionKeys?: string[]; isActive?: boolean },
  ) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @AuthPermission('roles.gestionar')
  @ApiOperation({ summary: 'Eliminar un rol' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}

// ── MODULE ───────────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([Role, Permiso])],
  providers: [RolesService],
  controllers: [RolesController],
  exports: [RolesService],
})
export class RolesModule {}