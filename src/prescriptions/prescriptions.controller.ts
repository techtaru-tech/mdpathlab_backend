import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { BadRequestException, Body, Controller, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { IMAGE_OR_DOCUMENT_EXTENSIONS, discardUpload, verifySavedUpload } from '../common/upload-safety.js';
import { PrescriptionsService } from './prescriptions.service.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';
import { ConfirmPrescriptionTestsDto } from './dto/confirm-prescription-tests.dto.js';
import { PrescriptionClarificationReplyDto } from './dto/prescription-clarification-reply.dto.js';

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
  // The stored extension comes from the declared type, never the client's filename (rx.html would be served as a page).
  filename: (_req, file, cb) => cb(null, randomUUID() + (IMAGE_OR_DOCUMENT_EXTENSIONS[file.mimetype] ?? '.bin')),
});

@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 20 * 1024 * 1024 } }))
  async create(@Req() req: any, @Body() dto: CreatePrescriptionDto, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Prescription file is required');
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      await discardUpload(file.path);
      throw new BadRequestException('File must be a JPEG, PNG, WebP, HEIC photo or a PDF');
    }
    // The declared type is only a claim — the file's own first bytes must agree with it.
    if (!(await verifySavedUpload(file.path, file.mimetype))) {
      throw new BadRequestException('The file does not look like a valid ' + file.mimetype + ' file');
    }

    return this.prescriptions.create(req.user.sub, dto, `/uploads/prescriptions/${file.filename}`);
  }

  @Get('me')
  listMine(@Req() req: any) {
    return this.prescriptions.listMine(req.user.sub);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.prescriptions.getOne(req.user.sub, id);
  }

  @Post(':id/confirm-tests')
  confirmTests(@Req() req: any, @Param('id') id: string, @Body() dto: ConfirmPrescriptionTestsDto) {
    return this.prescriptions.confirmTests(req.user.sub, id, dto);
  }

  @Post(':id/clarification-reply')
  replyClarification(@Req() req: any, @Param('id') id: string, @Body() dto: PrescriptionClarificationReplyDto) {
    return this.prescriptions.replyClarification(req.user.sub, id, dto);
  }
}
