import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { discardUpload, IMAGE_OR_DOCUMENT_EXTENSIONS, resolveUploadType } from '../common/upload-safety.js';
import { sharpnessScore } from '../common/blur-check.js';
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
  private readonly logger = new Logger('Prescriptions');

  constructor(
    private readonly prescriptions: PrescriptionsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 20 * 1024 * 1024 } }))
  async create(@Req() req: any, @Body() dto: CreatePrescriptionDto, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Prescription file is required');
    // The type is decided by the file's own bytes, not the content type the client claimed (the app sends
    // application/octet-stream for everything). Anything that is not really a photo or PDF is deleted and refused.
    const real = await resolveUploadType(file, IMAGE_OR_DOCUMENT_EXTENSIONS);
    if (!real) throw new BadRequestException('File must be a JPEG, PNG, WebP, HEIC photo or a PDF');

    // A blurry photo can't be read by the lab, so it is refused right away and the patient is asked to retake it.
    // PDFs and HEIC photos (not readable by the image library here) are not checked.
    if (real.mimetype === 'image/jpeg' || real.mimetype === 'image/png' || real.mimetype === 'image/webp') {
      const score = await sharpnessScore(real.path);
      const minimum = Number(this.config.get('PRESCRIPTION_MIN_SHARPNESS', 60));
      if (score !== null && score < minimum) {
        await discardUpload(real.path);
        this.logger.log(`Blurry prescription photo refused (sharpness ${score}, minimum ${minimum})`);
        throw new BadRequestException({
          statusCode: 400,
          code: 'PRESCRIPTION_BLURRY',
          message: 'This photo looks blurry, so the lab may not be able to read it. Please retake it in good light, holding the phone steady, so the writing is clear.',
        });
      }
    }

    return this.prescriptions.create(req.user.sub, dto, `/uploads/prescriptions/${real.filename}`);
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
