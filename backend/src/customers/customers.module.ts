import {
  Module, Controller, Injectable, Get, Post, Put, Patch,
  Body, Param, Query, Req, Res, UseInterceptors, UploadedFile,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Not } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Customer, CustomerDocument, CustomerStatus, Loan, UserRole } from '../common/entities';
import { Auth, CurrentUser } from '../common/guards/roles.guard';

// ── SERVICE ──────────────────────────────────────────────────
@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    @InjectRepository(CustomerDocument) private documentRepo: Repository<CustomerDocument>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
  ) {}

  async findAll(filters: {
    page?: number; limit?: number; search?: string;
    status?: string; stateId?: number; municipalityId?: number;
  }) {
    const { page = 1, limit = 20, search, status, stateId, municipalityId } = filters;
    const qb = this.customerRepo.createQueryBuilder('c')
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere(
        '(c.nombre_completo LIKE :s OR c.curp LIKE :s OR c.telefono LIKE :s OR c.correo LIKE :s)',
        { s: `%${search}%` },
      );
    }
    if (status) qb.andWhere('c.status = :status', { status });
    if (stateId) qb.andWhere('c.stateId = :stateId', { stateId });
    if (municipalityId) qb.andWhere('c.municipalityId = :municipalityId', { municipalityId });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({
      where: { id },
      relations: ['documents'],
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  async create(dto: Partial<Customer>, userId: string): Promise<Customer> {
    // Validar unicidad
    const checks: Promise<string | null>[] = [];

    if (dto.curp) {
      const qb = this.customerRepo.createQueryBuilder('c').where('c.curp = :curp', { curp: dto.curp });
      checks.push(qb.getOne().then((r) => r ? 'CURP ya registrada' : null));
    }
    if (dto.phone) {
      const qb = this.customerRepo.createQueryBuilder('c').where('c.phone = :phone', { phone: dto.phone });
      checks.push(qb.getOne().then((r) => r ? 'Teléfono ya registrado' : null));
    }

    const errors = (await Promise.all(checks)).filter(Boolean);
    if (errors.length > 0) throw new BadRequestException(errors[0] as string);

    const customer = this.customerRepo.create({ ...dto, createdBy: userId });
    return this.customerRepo.save(customer);
  }

  async update(id: string, dto: Partial<Customer>): Promise<Customer> {
    const customer = await this.findOne(id);
    Object.assign(customer, dto);
    return this.customerRepo.save(customer);
  }

  async changeStatus(id: string, status: CustomerStatus): Promise<Customer> {
    const customer = await this.findOne(id);
    customer.status = status;
    return this.customerRepo.save(customer);
  }

  async getLoans(customerId: string) {
    return this.loanRepo.find({
      where: { customerId },
      relations: ['loanType'],
      order: { createdAt: 'DESC' },
    });
  }

  async saveDocument(
    customerId: string,
    file: Express.Multer.File,
    docType: string,
    userId: string,
  ) {
    await this.findOne(customerId);
    const doc = this.documentRepo.create({
      customerId,
      docType,
      filePath: file.path,
      originalName: file.originalname,
      uploadedBy: userId,
    });
    return this.documentRepo.save(doc);
  }

  async getDocuments(customerId: string) {
    return this.documentRepo.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  async getDocumentById(id: string) {
    const doc = await this.documentRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    return doc;
  }

  async savePhoto(customerId: string, photoPath: string) {
    const customer = await this.findOne(customerId);
    customer.photoPath = photoPath;
    await this.customerRepo.save(customer);
    return { message: 'Foto guardada', photoPath };
  }
}

// ── MULTER CONFIG ─────────────────────────────────────────────
const documentStorage = diskStorage({
  destination: (req, file, cb) => {
    const dir = join(process.env.UPLOAD_DEST || './uploads', 'documentos');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

const photoStorage = diskStorage({
  destination: (req, file, cb) => {
    const dir = join(process.env.UPLOAD_DEST || './uploads', 'fotos-clientes');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.params.id}${ext}`);
  },
});

// ── CONTROLLER ───────────────────────────────────────────────
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Listar clientes con filtros y paginación' })
  findAll(@Query() q: any) {
    return this.customersService.findAll({
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 20,
      search: q.search,
      status: q.status,
      stateId: q.stateId ? Number(q.stateId) : undefined,
      municipalityId: q.municipalityId ? Number(q.municipalityId) : undefined,
    });
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @Auth()
  @ApiOperation({ summary: 'Crear nuevo cliente' })
  create(@Body() dto: Partial<Customer>, @CurrentUser('id') userId: string) {
    return this.customersService.create(dto, userId);
  }

  @Put(':id')
  @Auth()
  update(@Param('id') id: string, @Body() dto: Partial<Customer>) {
    return this.customersService.update(id, dto);
  }

  @Patch(':id/status')
  @Auth(UserRole.ADMIN)
  changeStatus(@Param('id') id: string, @Body('status') status: CustomerStatus) {
    return this.customersService.changeStatus(id, status);
  }

  @Get(':id/loans')
  @Auth()
  getLoans(@Param('id') id: string) {
    return this.customersService.getLoans(id);
  }

  @Post(':id/documents')
  @Auth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: documentStorage,
    fileFilter: (req, file, cb) => {
      const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
      const ext = extname(file.originalname).toLowerCase();
      cb(
        allowed.includes(ext) ? null : new BadRequestException('Solo PDF e imágenes'),
        allowed.includes(ext),
      );
    },
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('docType') docType: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.customersService.saveDocument(id, file, docType || 'IDENTIFICACION', userId);
  }

  @Get(':id/documents')
  @Auth()
  getDocuments(@Param('id') id: string) {
    return this.customersService.getDocuments(id);
  }

  @Get('documents/:docId')
  @Auth()
  async getDocument(@Param('docId') docId: string, @Res() res: any) {
    const doc = await this.customersService.getDocumentById(docId);
    if (!existsSync(doc.filePath)) throw new NotFoundException('Archivo no encontrado');
    res.sendFile(doc.filePath, { root: '.' });
  }

  @Post(':id/photo')
  @Auth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('photo', {
    storage: photoStorage,
    fileFilter: (req, file, cb) => {
      const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
      const ext = extname(file.originalname).toLowerCase();
      cb(
        allowed.includes(ext) ? null : new BadRequestException('Solo JPG, PNG o WEBP'),
        allowed.includes(ext),
      );
    },
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.customersService.savePhoto(id, file.path);
  }

  @Get(':id/photo')
  @Auth()
  async getPhoto(@Param('id') id: string, @Res() res: any) {
    const customer = await this.customersService.findOne(id);
    if (!customer.photoPath || !existsSync(customer.photoPath)) {
      throw new NotFoundException('Sin foto registrada');
    }
    res.sendFile(customer.photoPath, { root: '.' });
  }
}

// ── MODULE ───────────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([Customer, CustomerDocument, Loan])],
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}