import { BadRequestException, Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { IsInt, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { MessageTemplatesService, type MessageEvent } from '../notifications/message-templates.js';
import { SmsService } from '../sms/sms.service.js';

export class BookingChargesDto {
  // Free distance from the lab (km); beyond it the additional collection charge applies.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  farCollectionKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  farCollectionCharge?: number;

  // Go Green: what printed reports cost per booking (0 = free).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  printingCharge?: number;

  // Hours before the slot that the appointment reminder goes out (0 = no reminders).
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(48)
  reminderHoursBefore?: number;
}

type TemplateDto = { title?: string; body?: string; enabled?: boolean };

export class SaveTemplatesDto {
  // { [event]: { title?, body?, enabled? } | null } — null puts that event back to the default text.
  @IsObject()
  templates!: Record<string, TemplateDto | null>;
}

/** Admin → Settings → Charges & reminders, and Messages (the patient notification texts). */
@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminCommunicationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly templates: MessageTemplatesService,
    private readonly sms: SmsService,
  ) {}

  @Get('booking-charges')
  async charges() {
    const s = await this.settings.getOrCreate();
    return { farCollectionKm: s.farCollectionKm, farCollectionCharge: s.farCollectionCharge, printingCharge: s.printingCharge, reminderHoursBefore: s.reminderHoursBefore };
  }

  @Patch('booking-charges')
  async saveCharges(@Body() dto: BookingChargesDto) {
    const s = await this.settings.getOrCreate();
    await this.prisma.siteSetting.update({
      where: { id: s.id },
      data: {
        ...(dto.farCollectionKm !== undefined ? { farCollectionKm: dto.farCollectionKm } : {}),
        ...(dto.farCollectionCharge !== undefined ? { farCollectionCharge: dto.farCollectionCharge } : {}),
        ...(dto.printingCharge !== undefined ? { printingCharge: dto.printingCharge } : {}),
        ...(dto.reminderHoursBefore !== undefined ? { reminderHoursBefore: dto.reminderHoursBefore } : {}),
      },
    });
    return this.charges();
  }

  // Every patient message: its push/in-app text (editable) and its SMS (fixed by DLT, live or not).
  @Get('message-templates')
  async list() {
    return { templates: await this.templates.list(), sms: this.sms.templateStatus() };
  }

  @Put('message-templates')
  async save(@Body() dto: SaveTemplatesDto) {
    for (const [key, t] of Object.entries(dto.templates)) {
      if (t === null) continue;
      if (typeof t !== 'object') throw new BadRequestException(key + ': expected { title, body, enabled }');
      if (t.title !== undefined && (typeof t.title !== 'string' || t.title.length > 120)) throw new BadRequestException(key + ': title must be text up to 120 characters');
      if (t.body !== undefined && (typeof t.body !== 'string' || t.body.length > 600)) throw new BadRequestException(key + ': message must be text up to 600 characters');
      if (t.enabled !== undefined && typeof t.enabled !== 'boolean') throw new BadRequestException(key + ': enabled must be true or false');
    }
    await this.templates.save(dto.templates as Partial<Record<MessageEvent, TemplateDto | null>>);
    return this.list();
  }
}
