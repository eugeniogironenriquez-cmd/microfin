import {
  Module, Controller, Injectable, Get, Post, Put, Delete,
  Body, Param, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Sucursal, User, Role } from '../common/entities';
import { Auth, AuthPermission, CurrentUser } from '../common/guards/roles.guard';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SucursalesService {
  constructor(
    @InjectRepository(Sucursal) private sucursalRepo: Repository<Sucursal>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    private dataSource: DataSource,
  ) {}

  // Lista de sucursales. Un usuario global las ve todas; uno normal solo ve
  // la suya (para no exponer la existencia de otras sucursales).
  async findAll(sucursalId?: string, isGlobal?: boolean) {
    if (isGlobal) {
      return this.sucursalRepo.find({ order: { isMatriz: 'DESC', name: 'ASC' } });
    }
    if (sucursalId) {
      return this.sucursalRepo.find({ where: { id: sucursalId } });
    }
    return [];
  }

  async findActive() {
    return this.sucursalRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Sucursal> {
    const s = await this.sucursalRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Sucursal no encontrada');
    return s;
  }

  // Crea una sucursal y, opcionalmente, su usuario administrador, en una sola
  // transacción. El admin queda asignado a la nueva sucursal para que desde
  // ahí cree al resto de usuarios de su sucursal.
  async create(dto: {
    name: string; code?: string; address?: string; phone?: string;
    admin?: { name: string; email: string; password: string };
  }) {
    if (!dto.name) throw new BadRequestException('El nombre de la sucursal es obligatorio');

    // Validar código único si se proporcionó.
    if (dto.code) {
      const existe = await this.sucursalRepo.findOne({ where: { code: dto.code } });
      if (existe) throw new BadRequestException('Ya existe una sucursal con ese código');
    }
    // Validar correo del admin si se proporcionó.
    if (dto.admin?.email) {
      const existeUser = await this.userRepo.findOne({ where: { email: dto.admin.email } });
      if (existeUser) throw new BadRequestException('Ya existe un usuario con ese correo');
    }
    if (dto.admin && (!dto.admin.password || dto.admin.password.length < 8)) {
      throw new BadRequestException('La contraseña del administrador debe tener al menos 8 caracteres');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // 1. Crear la sucursal.
      const sucursal = this.sucursalRepo.create({
        name: dto.name,
        code: dto.code || null as any,
        address: dto.address || null as any,
        phone: dto.phone || null as any,
        isMatriz: false,
        isActive: true,
      });
      const savedSucursal = await qr.manager.save(sucursal);

      // 2. Crear el usuario administrador de la sucursal, si se indicó.
      let savedAdmin: any = null;
      if (dto.admin?.email) {
        // Buscar un rol administrador para asignárselo.
        const rolAdmin = await this.roleRepo.findOne({ where: { isAdmin: true } });
        const hash = await bcrypt.hash(dto.admin.password, 12);
        const admin = this.userRepo.create({
          name: dto.admin.name,
          email: dto.admin.email,
          passwordHash: hash,
          roleId: rolAdmin?.id,
          sucursalId: savedSucursal.id,
          isGlobal: false,
          isActive: true,
        } as any);
        savedAdmin = await qr.manager.save(admin);
      }

      await qr.commitTransaction();
      return {
        sucursal: savedSucursal,
        admin: savedAdmin
          ? { id: savedAdmin.id, name: savedAdmin.name, email: savedAdmin.email }
          : null,
        message: savedAdmin
          ? 'Sucursal y usuario administrador creados correctamente'
          : 'Sucursal creada correctamente',
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async update(id: string, dto: Partial<Sucursal>): Promise<Sucursal> {
    const s = await this.findOne(id);
    // La matriz no puede dejar de serlo desde aquí.
    Object.assign(s, {
      name: dto.name ?? s.name,
      code: dto.code ?? s.code,
      address: dto.address ?? s.address,
      phone: dto.phone ?? s.phone,
      isActive: dto.isActive ?? s.isActive,
    });
    return this.sucursalRepo.save(s);
  }

  async toggleActive(id: string): Promise<Sucursal> {
    const s = await this.findOne(id);
    if (s.isMatriz) throw new BadRequestException('La sucursal matriz no se puede desactivar');
    s.isActive = !s.isActive;
    return this.sucursalRepo.save(s);
  }
}

@ApiTags('sucursales')
@ApiBearerAuth()
@Controller('sucursales')
export class SucursalesController {
  constructor(private svc: SucursalesService) {}

  // Lista de sucursales (global ve todas; normal solo la suya).
  @Get() @Auth()
  findAll(
    @CurrentUser('sucursalId') sucursalId: string,
    @CurrentUser('isGlobal') isGlobal: boolean,
  ) {
    return this.svc.findAll(sucursalId, isGlobal);
  }

  // Sucursales activas (para selects). Solo global obtiene la lista completa.
  @Get('active') @Auth()
  findActive(
    @CurrentUser('sucursalId') sucursalId: string,
    @CurrentUser('isGlobal') isGlobal: boolean,
  ) {
    return isGlobal ? this.svc.findActive() : this.svc.findAll(sucursalId, false);
  }

  @Get(':id') @Auth()
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  // Alta de sucursal + admin. Requiere permiso de administración de sucursales.
  @Post() @AuthPermission('sucursales.crear')
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Put(':id') @AuthPermission('sucursales.crear')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') @AuthPermission('sucursales.crear')
  toggle(@Param('id') id: string) {
    return this.svc.toggleActive(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Sucursal, User, Role])],
  controllers: [SucursalesController],
  providers: [SucursalesService],
  exports: [SucursalesService],
})
export class SucursalesModule {}
