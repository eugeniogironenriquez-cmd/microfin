import {
  Module, Controller, Injectable, Get, Put, Post,
  Body, UploadedFile, UseInterceptors, BadRequestException, Res, NotFoundException
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { CompanySettings, UserRole } from '../common/entities';
import { Auth } from '../common/guards/roles.guard';
import { Response } from 'express';

//   import { existsSync, mkdirSync } from 'fs';            // existsSync ya estaba

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(CompanySettings) private repo: Repository<CompanySettings>,
  ) {}

  async get(): Promise<CompanySettings> {
    const settings = await this.repo.findOne({ where: {} });
    if (!settings) {
      const initial = this.repo.create({ name: 'Mi Empresa Microfinanciera' });
      return this.repo.save(initial);
    }
    return settings;
  }

  async update(dto: Partial<CompanySettings>): Promise<CompanySettings> {
    const settings = await this.get();
    Object.assign(settings, dto);
    return this.repo.save(settings);
  }

  async uploadLogo(file: Express.Multer.File): Promise<CompanySettings> {
    const settings = await this.get();
    settings.logoPath = file.path;
    return this.repo.save(settings);
  }
}

@ApiTags('company')
@ApiBearerAuth()
@Controller('company')
export class CompanyController {
  constructor(private companyService: CompanyService) {}

  @Get()
  @Auth()
  get() { return this.companyService.get(); }

  @Put()
  @Auth(UserRole.ADMIN)
  update(@Body() dto: Partial<CompanySettings>) {
    return this.companyService.update(dto);
  }

  @Post('logo')
  @Auth(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const baseDir = process.env.UPLOAD_DEST || join(process.cwd(), '..', 'storage', 'uploads');

        //const dir = join(process.env.UPLOAD_DEST || './uploads', 'empresa');
        if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
        cb(null, baseDir);
      },
      filename: (req, file, cb) => cb(null, `logo${extname(file.originalname)}`),
    }),
    fileFilter: (req, file, cb) => {
      const allowed = ['.png', '.jpg', '.jpeg', '.svg'];
      const ext = extname(file.originalname).toLowerCase();
      cb(allowed.includes(ext) ? null : new BadRequestException('Solo imágenes'), allowed.includes(ext));
    },
    limits: { fileSize: 2 * 1024 * 1024 },
  }))
  uploadLogo(@UploadedFile() file: Express.Multer.File) {
    return this.companyService.uploadLogo(file);
  }

  @Get('logo')
  @Auth()
  async getLogo(@Res() res: Response) {
    const settings = await this.companyService.get();
    const path = settings.logoPath;
    if (!path || !existsSync(path)) {
      throw new NotFoundException('No hay logo configurado');
    }
    // Envía el archivo tal cual (Express infiere el tipo por extensión).
    return res.sendFile(path, { root: process.cwd() });
  }

}

@Module({
  imports: [TypeOrmModule.forFeature([CompanySettings])],
  providers: [CompanyService],
  controllers: [CompanyController],
  exports: [CompanyService],
})
export class CompanyModule {}
