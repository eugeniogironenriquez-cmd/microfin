import {
  Module, Controller, Injectable, Post, Get,
  Body, Req, UseGuards, UnauthorizedException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../common/entities';

// ── JWT STRATEGY ─────────────────────────────────────────────
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {
    const secret = config.get<string>('JWT_SECRET') || process.env.JWT_SECRET || 'fallback_secret_change_me';
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('Usuario no autorizado');
    return { id: user.id, email: user.email, role: user.role, name: user.name };
  }
}

// ── AUTH SERVICE ─────────────────────────────────────────────
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();

    if (!user || !user.isActive)
      throw new UnauthorizedException('Credenciales inválidas');
    if (!user.passwordHash)
      throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const tokens = await this.generateTokens(user);
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.refreshTokenHash) throw new ForbiddenException('Acceso denegado');
    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new ForbiddenException('Token inválido');
    const tokens = await this.generateTokens(user);
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.userRepo.save(user);
    return tokens;
  }

  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshTokenHash: undefined });
    return { message: 'Sesión cerrada' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo
      .createQueryBuilder('u').addSelect('u.passwordHash')
      .where('u.id = :id', { id: userId }).getOne();
    if (!user) throw new BadRequestException('Usuario no encontrado');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Contraseña actual incorrecta');
    if (newPassword.length < 8) throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.save(user);
    return { message: 'Contraseña actualizada' };
  }

  private async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const secret = this.config.get('JWT_SECRET') || process.env.JWT_SECRET;
    const refreshSecret = this.config.get('JWT_REFRESH_SECRET') || process.env.JWT_REFRESH_SECRET;
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { secret, expiresIn: '15m' }),
      this.jwtService.signAsync(payload, { secret: refreshSecret, expiresIn: '7d' }),
    ]);
    return { accessToken, refreshToken };
  }
}

// ── AUTH CONTROLLER ──────────────────────────────────────────
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('refresh')
  refresh(@Body() body: { userId: string; refreshToken: string }) {
    return this.authService.refresh(body.userId, body.refreshToken);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Post('logout')
  logout(@Req() req: any) { return this.authService.logout(req.user.id); }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Post('change-password')
  changePassword(@Req() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Get('me')
  getMe(@Req() req: any) { return req.user; }
}

// ── AUTH MODULE ──────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || process.env.JWT_SECRET,
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [JwtStrategy, PassportModule, JwtModule],
})
export class AuthModule {}
