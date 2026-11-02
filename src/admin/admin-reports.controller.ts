import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import {
  BadRequestException,
  Controller,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportReleaseService } from '../reports/report-release.service.js';
import { ReportGeneratorService } from './report-generator.service.js';

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'reports'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportGenerator: ReportGeneratorService,
    private readonly release: ReportReleaseService,
  ) {}

  // Auto-generates a PDF from the lab's entered result values (ReportGeneratorService) instead
  // of admin uploading one by hand — lands in the exact same PENDING-review state as a manual
  // upload, so approval/release/download all go through the one existing path either way.
  @Post('orders/:id/reports/generate')
  async generateReport(@Req() req: any, @Param('id') orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const { fileUrl } = await this.reportGenerator.generate(orderId);

    return this.prisma.report.create({
      data: { orderId, fileUrl, status: 'UPLOADED', uploadedBy: `${req.admin.email} (auto-generated)` },
    });
  }

  @Post('orders/:id/reports')
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 15 * 1024 * 1024 } }))
  async upload(@Req() req: any, @Param('id') orderId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Reports must be a PDF');

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.report.create({
      data: {
        orderId,
        fileUrl: `/uploads/reports/${file.filename}`,
        status: 'UPLOADED',
        uploadedBy: req.admin.email,
      },
    });
  }

  // Release to the patient (also what a lab's upload does straight away — see ReportReleaseService).
  @Post('reports/:reportId/approve')
  approve(@Param('reportId') reportId: string) {
    return this.release.release(reportId, 'ADMIN');
  }
}
