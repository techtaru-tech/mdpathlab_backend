import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { open, unlink } from 'fs/promises';
import { join } from 'path';
import { BadRequestException, Controller, Delete, NotFoundException, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const REPORTS_DIR = join(process.cwd(), 'uploads', 'reports');
// multer never creates its destination (see admin-settings.controller.ts for the incident this guards against).
mkdirSync(REPORTS_DIR, { recursive: true });

const storage = diskStorage({
  destination: REPORTS_DIR,
  // Always a random name with a fixed extension — nothing from the uploaded file name reaches the disk path.
  filename: (_req, _file, cb) => cb(null, `${randomUUID()}.pdf`),
});

// The same mark the admin screen shows next to a report this lab uploaded.
const LAB_SUFFIX = ' (lab)';
// A lab may upload once the sample is with it; REPORT_READY allows a corrected report (released again by admin).
const UPLOAD_STATUSES = ['SAMPLE_COLLECTED', 'IN_LAB', 'REPORT_READY'];

type LabRequest = { lab: { labId: string; email: string } };

async function isPdf(path: string): Promise<boolean> {
  const fh = await open(path, 'r');
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(5), 0, 5, 0);
    return bytesRead === 5 && buffer.toString('latin1') === '%PDF-';
  } finally {
    await fh.close();
  }
}

/**
 * A partner lab uploads the PDF report for one of its own bookings. The report lands in the same UPLOADED
 * (pending) state as an admin upload, so release still goes through the one existing path: admin reviews it and
 * "Approve & release" sets the booking to REPORT_READY and notifies the patient. Until then the lab can remove a
 * report it uploaded by mistake.
 */
@Controller('lab/orders/:orderId/reports')
@UseGuards(LabAuthGuard)
export class LabReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async ownedOrder(labId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, labId: true, status: true, orderNumber: true } });
    // Another lab's order looks exactly like a missing one.
    if (!order || order.labId !== labId) throw new NotFoundException('Order not found');
    return order;
  }

  private reports(orderId: string) {
    return this.prisma.report.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      limits: { fileSize: 15 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
    }),
  )
  async upload(@Req() req: LabRequest, @Param('orderId') orderId: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Choose the report PDF to upload');
    try {
      // The browser's content type is only a claim — the file itself must be a PDF.
      if (!(await isPdf(file.path))) throw new BadRequestException('Reports must be a PDF');
      const order = await this.ownedOrder(req.lab.labId, orderId);
      if (order.status === 'CANCELLED') throw new BadRequestException('This booking is cancelled');
      if (!UPLOAD_STATUSES.includes(order.status)) throw new BadRequestException('A report can be uploaded once the sample has been collected');
      await this.prisma.report.create({
        data: { orderId, fileUrl: `/uploads/reports/${file.filename}`, status: 'UPLOADED', uploadedBy: `${req.lab.email}${LAB_SUFFIX}` },
      });
    } catch (err) {
      await unlink(file.path).catch(() => undefined);
      throw err;
    }
    const order = await this.ownedOrder(req.lab.labId, orderId);
    void this.notifications.notifyAdmins({
      title: 'Lab uploaded a report',
      body: `Order ${order.orderNumber} — review it and approve to release it to the patient.`,
      data: { type: 'LAB_REPORT_UPLOADED', orderId },
    });
    return this.reports(orderId);
  }

  // Only a report this lab uploaded, and only before admin has approved (released) it.
  @Delete(':reportId')
  async remove(@Req() req: LabRequest, @Param('orderId') orderId: string, @Param('reportId') reportId: string) {
    await this.ownedOrder(req.lab.labId, orderId);
    const report = await this.prisma.report.findFirst({ where: { id: reportId, orderId } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.uploadedBy !== `${req.lab.email}${LAB_SUFFIX}`) throw new BadRequestException('Only reports your lab uploaded can be removed');
    const removed = await this.prisma.report.deleteMany({ where: { id: reportId, status: { not: 'APPROVED' } } });
    if (removed.count !== 1) throw new BadRequestException('This report has already been released to the patient and cannot be removed');
    if (report.fileUrl?.startsWith('/uploads/reports/')) {
      await unlink(join(REPORTS_DIR, report.fileUrl.slice('/uploads/reports/'.length))).catch(() => undefined);
    }
    return this.reports(orderId);
  }
}
