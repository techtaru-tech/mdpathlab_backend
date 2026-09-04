import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Always exactly one row — created on first access with all-defaults if it doesn't exist yet. */
  async getOrCreate() {
    const existing = await this.prisma.siteSetting.findFirst();
    if (existing) return existing;
    return this.prisma.siteSetting.create({ data: {} });
  }

  /** razorpayKeySecret/razorpayWebhookSecret are never exposed outside the admin panel. */
  async getPublic() {
    const { razorpayKeySecret: _keySecret, razorpayWebhookSecret: _webhookSecret, ...rest } = await this.getOrCreate();
    return rest;
  }
}
