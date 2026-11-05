import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { BadRequestException, Controller, Delete, Get, NotFoundException, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { IMAGE_EXTENSIONS, resolveUploadType } from '../common/upload-safety.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PHOTO_DIR = join(process.cwd(), 'uploads', 'sample-photos');
const PHOTO_PREFIX = '/uploads/sample-photos/';
// multer never creates its destination (see admin-settings.controller.ts for the incident this guards against).
mkdirSync(PHOTO_DIR, { recursive: true });
const storage = diskStorage({
  destination: PHOTO_DIR,
  // Always a random name; the real extension is set from the file's bytes once it is saved (resolveUploadType).
  filename: (_req, file, cb) => cb(null, randomUUID() + (IMAGE_EXTENSIONS[file.mimetype] ?? '.bin')),
});

export const MAX_SAMPLE_PHOTOS = 6;
// Photos can be added from arrival at the door until the lab confirms it has the sample.
const UPLOAD_STATUSES = ['PHLEBOTOMIST_ASSIGNED', 'SAMPLE_COLLECTED', 'IN_LAB'];

type PhlebotomistRequest = { phlebotomist: { phlebotomistId: string } };

/**
 * Photos of the collected sample(s) — tubes with their labels — taken by the phlebotomist in the app, so admin can
 * verify what was collected. Only the assigned phlebotomist can add or remove them; admin sees them on the booking.
 * The files sit under a protected prefix, so they are only ever reachable through a signed link in an API response.
 */
@Controller('phlebotomist/orders/:id/sample-photos')
@UseGuards(PhlebotomistAuthGuard)
export class PhlebotomistSamplePhotosController {
  constructor(private readonly prisma: PrismaService) {}

  private async ownOrder(phlebotomistId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, phlebotomistId: true, status: true, reachedAt: true, sampleReceivedAt: true },
    });
    // Another phlebotomist's booking looks exactly like a missing one.
    if (!order || order.phlebotomistId !== phlebotomistId) throw new NotFoundException('Booking not found');
    return order;
  }

  private list(orderId: string) {
    return this.prisma.orderSamplePhoto.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fileUrl: true, createdAt: true },
    });
  }

  @Get()
  async photos(@Req() req: PhlebotomistRequest, @Param('id') id: string) {
    await this.ownOrder(req.phlebotomist.phlebotomistId, id);
    return this.list(id);
  }

  // multipart/form-data with the picture in the `photo` field (JPEG, PNG or WebP, up to 10 MB). One photo per call.
  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('photo', { storage, limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async upload(@Req() req: PhlebotomistRequest, @Param('id') id: string, @UploadedFile() photo: Express.Multer.File | undefined) {
    if (!photo) throw new BadRequestException('Attach the sample photo in the "photo" field');
    try {
      // The app's content type is only a claim (many send application/octet-stream) — the bytes decide.
      const real = await resolveUploadType(photo, IMAGE_EXTENSIONS);
      if (!real) throw new BadRequestException('The photo must be a JPEG, PNG or WebP image');
      photo.filename = real.filename;
      photo.path = real.path;

      const order = await this.ownOrder(req.phlebotomist.phlebotomistId, id);
      if (order.status === 'CANCELLED') throw new BadRequestException('This booking is cancelled');
      if (!UPLOAD_STATUSES.includes(order.status) || !order.reachedAt || order.sampleReceivedAt) {
        throw new BadRequestException('Sample photos can be added from arrival until the lab receives the sample');
      }
      if ((await this.prisma.orderSamplePhoto.count({ where: { orderId: id } })) >= MAX_SAMPLE_PHOTOS) {
        throw new BadRequestException(`At most ${MAX_SAMPLE_PHOTOS} photos per booking — remove one to add another`);
      }
      await this.prisma.orderSamplePhoto.create({
        data: { orderId: id, fileUrl: PHOTO_PREFIX + photo.filename, phlebotomistId: req.phlebotomist.phlebotomistId },
      });
    } catch (err) {
      await unlink(photo.path).catch(() => undefined);
      throw err;
    }
    return this.list(id);
  }

  // A wrong photo can be removed until the lab has received the sample; after that it is part of the record.
  @Delete(':photoId')
  async remove(@Req() req: PhlebotomistRequest, @Param('id') id: string, @Param('photoId') photoId: string) {
    const order = await this.ownOrder(req.phlebotomist.phlebotomistId, id);
    if (order.sampleReceivedAt || !UPLOAD_STATUSES.includes(order.status)) {
      throw new BadRequestException('The lab has the sample now, so its photos can no longer be removed');
    }
    const photo = await this.prisma.orderSamplePhoto.findFirst({ where: { id: photoId, orderId: id } });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.prisma.orderSamplePhoto.delete({ where: { id: photo.id } });
    if (photo.fileUrl.startsWith(PHOTO_PREFIX)) {
      await unlink(join(PHOTO_DIR, photo.fileUrl.slice(PHOTO_PREFIX.length))).catch(() => undefined);
    }
    return this.list(id);
  }
}
