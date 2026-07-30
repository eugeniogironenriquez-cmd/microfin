import {
  Module, Controller, Injectable, Post, Get, Delete,
  Param, Body, Res, UploadedFile, UseInterceptors,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Auth, AuthPermission, CurrentUser } from '../common/guards/roles.guard';
import { UserRole } from '../common/entities';

// ── SERVICE ───────────────────────────────────────────────────
@Injectable()
export class LoanDocumentsService {
  constructor(private dataSource: DataSource) {}

  async upload(
    loanId: string,
    file: Express.Multer.File,
    description: string,
    userId: string,
  ) {
    const id = require('crypto').randomUUID();
    await this.dataSource.query(
      `INSERT INTO documentos_prestamo
        (id, prestamo_id, tipo, descripcion, nombre_archivo, ruta_archivo, mimetype, tamano, subido_por)
       VALUES (?, ?, 'garantia', ?, ?, ?, ?, ?, ?)`,
      [id, loanId, description || null, file.originalname,
       file.path, file.mimetype, file.size, userId]
    );
    return { id, fileName: file.originalname, message: 'Documento subido correctamente' };
  }

  async findByLoan(loanId: string) {
    return this.dataSource.query(
      `SELECT id, tipo, descripcion, nombre_archivo, mimetype, tamano, creado_en
       FROM documentos_prestamo WHERE prestamo_id = ? ORDER BY creado_en DESC`,
      [loanId]
    );
  }

  async getFile(docId: string, res: Response) {
    const [doc] = await this.dataSource.query(
      'SELECT * FROM documentos_prestamo WHERE id = ?', [docId]
    );
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (!existsSync(doc.ruta_archivo))
      throw new NotFoundException('Archivo no encontrado en el servidor');
    res.setHeader('Content-Type', doc.mimetype);
    res.setHeader('Content-Disposition',
      `inline; filename="${encodeURIComponent(doc.nombre_archivo)}"`);
    res.sendFile(doc.ruta_archivo, { root: '/' });
  }

  async delete(docId: string) {
    const [doc] = await this.dataSource.query(
      'SELECT ruta_archivo FROM documentos_prestamo WHERE id = ?', [docId]
    );
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (existsSync(doc.ruta_archivo)) {
      try { unlinkSync(doc.ruta_archivo); } catch {}
    }
    await this.dataSource.query(
      'DELETE FROM documentos_prestamo WHERE id = ?', [docId]
    );
    return { deleted: true };
  }
}

// ── CONTROLLER ───────────────────────────────────────────────
@ApiTags('loan-documents')
@ApiBearerAuth()
@Controller('loans')
export class LoanDocumentsController {
  constructor(private svc: LoanDocumentsService) {}

  @Post(':id/documents')
  @AuthPermission('prestamos.crear')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const dir = join(process.cwd(), 'uploads', 'garantias');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
        cb(null, unique + extname(file.originalname));
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
      if (!allowed.includes(extname(file.originalname).toLowerCase())) {
        return cb(new BadRequestException('Solo se permiten PDF, JPG y PNG'), false);
      }
      cb(null, true);
    },
  }))
  upload(
    @Param('id') loanId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('description') description: string,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.svc.upload(loanId, file, description, userId);
  }

  @Get(':id/documents')
  @Auth()
  findByLoan(@Param('id') loanId: string) {
    return this.svc.findByLoan(loanId);
  }

  @Get('documents/:docId/file')
  @Auth()
  getFile(@Param('docId') docId: string, @Res() res: Response) {
    return this.svc.getFile(docId, res);
  }

  @Delete('documents/:docId')
  @AuthPermission('prestamos.crear')
  delete(@Param('docId') docId: string) {
    return this.svc.delete(docId);
  }
}

// ── MODULE ───────────────────────────────────────────────────
@Module({
  providers: [LoanDocumentsService],
  controllers: [LoanDocumentsController],
  exports: [LoanDocumentsService],
})
export class LoanDocumentsModule {}