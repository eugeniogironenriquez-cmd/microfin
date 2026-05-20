import {
  Module, Controller, Injectable, Get, Post, Put, Patch,
  Body, Param, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../common/entities';
import { Auth } from '../common/guards/roles.guard';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private userRepo: Repository<User>) {}

  async findAll() {
    return this.userRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<User> {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return u;
  }

  async create(dto: { name: string; email: string; password: string; role: UserRole }): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('El correo ya está registrado');
    if (dto.password.length < 8) throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    const hash = await bcrypt.hash(dto.password, 12);
    const u = this.userRepo.create({ name: dto.name, email: dto.email, passwordHash: hash, role: dto.role });
    return this.userRepo.save(u);
  }

  async update(id: string, dto: Partial<{ name: string; role: UserRole }>): Promise<User> {
    const u = await this.findOne(id);
    Object.assign(u, dto);
    return this.userRepo.save(u);
  }

  async resetPassword(id: string, newPassword: string): Promise<{ message: string }> {
    if (newPassword.length < 8) throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    const u = await this.findOne(id);
    u.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.save(u);
    return { message: 'Contraseña restablecida' };
  }

  async toggleActive(id: string): Promise<User> {
    const u = await this.findOne(id);
    u.isActive = !u.isActive;
    return this.userRepo.save(u);
  }

  async getCollectors(): Promise<User[]> {
    return this.userRepo.find({
      where: { role: UserRole.COBRADOR, isActive: true },
      order: { name: 'ASC' },
    });
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get() @Auth(UserRole.ADMIN)
  findAll() { return this.usersService.findAll(); }

  @Get('collectors') @Auth()
  getCollectors() { return this.usersService.getCollectors(); }

  @Get(':id') @Auth(UserRole.ADMIN)
  findOne(@Param('id') id: string) { return this.usersService.findOne(id); }

  @Post() @Auth(UserRole.ADMIN)
  create(@Body() dto: { name: string; email: string; password: string; role: UserRole }) {
    return this.usersService.create(dto);
  }

  @Put(':id') @Auth(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: Partial<{ name: string; role: UserRole }>) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/reset-password') @Auth(UserRole.ADMIN)
  resetPassword(@Param('id') id: string, @Body('password') password: string) {
    return this.usersService.resetPassword(id, password);
  }

  @Patch(':id/toggle') @Auth(UserRole.ADMIN)
  toggleActive(@Param('id') id: string) { return this.usersService.toggleActive(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}