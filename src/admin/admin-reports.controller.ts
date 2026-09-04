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
import { NotificationsService } from '../notifications/notifications.service.js';

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'reports'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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

  @Post('reports/:reportId/approve')
  async approve(@Param('reportId') reportId: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    const order = await this.prisma.order.findUnique({ where: { id: report.orderId } });
    if (!order) throw new NotFoundException('Order not found');
    // A cancelled order must stay cancelled — approving a report against it would silently
    // overwrite that back to REPORT_READY with no warning.
    if (order.status === 'CANCELLED') throw new BadRequestException('This report belongs to a cancelled order and cannot be approved');

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedReport = await tx.report.update({
        where: { id: reportId },
        data: { status: 'APPROVED', approvedAt: new Date() },
      });
      await tx.order.update({
        where: { id: report.orderId },
        data: {
          status: 'REPORT_READY',
          statusLogs: { create: { status: 'REPORT_READY', note: 'Report approved and released', changedBy: 'ADMIN' } },
        },
      });
      return updatedReport;
    });

    await this.notifications.notifyUser(order.userId, {
      title: 'Your report is ready',
      body: `Order ${order.orderNumber} — your report has been released`,
      data: { type: 'ORDER_STATUS', orderId: order.id, status: 'REPORT_READY' },
    });

    return updated;
  }
}
