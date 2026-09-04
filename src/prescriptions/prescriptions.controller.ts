import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { BadRequestException, Body, Controller, Get, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrescriptionsService } from './prescriptions.service.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';

// image/heic and image/heif are included because iPhone camera photos default to HEIC — the
// single most common real-world prescription-photo format we'd otherwise silently reject.
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'prescriptions');
// diskStorage never creates its destination — see admin-settings.controller.ts for the incident
// this pattern is copied from.
mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 20 * 1024 * 1024 } }))
  async create(@Req() req: any, @Body() dto: CreatePrescriptionDto, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Prescription file is required');
    if (!ALLOWED_TYPES.has(file.mimetype)) throw new BadRequestException('File must be a JPEG, PNG, WebP, HEIC photo or a PDF');

    return this.prescriptions.create(req.user.sub, dto, `/uploads/prescriptions/${file.filename}`);
  }

  @Get('me')
  listMine(@Req() req: any) {
    return this.prescriptions.listMine(req.user.sub);
  }
}
