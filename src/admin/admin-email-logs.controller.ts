import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import type { Prisma } from '@prisma/client';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';

class SendTestEmailDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  to!: string;
}

// Delivery history of every transactional email, plus a "send test email" to check the SMTP
// settings without waiting for a real booking.
@Controller('admin/email-logs')
@UseGuards(AdminAuthGuard)
export class AdminEmailLogsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Get()
  async list(@Query('status') status?: string, @Query('limit') limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const where: Prisma.EmailLogWhereInput = status === 'SENT' || status === 'FAILED' || status === 'SKIPPED' ? { status } : {};
    const [rows, counts] = await Promise.all([
      this.prisma.emailLog.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.emailLog.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      configured: this.mail.isConfigured(),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      rows,
    };
  }

  @Post('test')
  test(@Body() dto: SendTestEmailDto) {
    return this.mail.sendTest(dto.to);
  }
}
