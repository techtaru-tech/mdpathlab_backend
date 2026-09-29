import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Always exactly one row — created on first access with all-defaults if it doesn't exist yet. */
  async getOrCreate() {
    const existing = await this.prisma.siteSetting.findFirst();
    if (existing) return existing;
    return this.prisma.siteSetting.create({ data: {} });
  }

  /**
   * razorpayKeySecret/razorpayWebhookSecret are never exposed outside the admin panel.
   *
   * `config` bundles the fee/bonus/window constants that would otherwise have to be hardcoded
   * client-side (see CUSTOMER_APP_BACKEND_REQUIREMENTS_MAPPING.md §13/§15) — every value here is
   * read from the exact same env vars the real pricing/OTP/cancellation logic already uses
   * (OrdersService.computeHomeCollectionFee, AuthService, SlotsService availability), so a client
   * that reads this response and one that books a real order can never see different numbers.
   */
  async getPublic() {
    const { razorpayKeySecret: _keySecret, razorpayWebhookSecret: _webhookSecret, ...rest } = await this.getOrCreate();
    return {
      ...rest,
      config: {
        homeCollectionFee: {
          freeKm: Number(this.config.get('HOME_COLLECTION_FREE_KM', 5)),
          tier2Km: Number(this.config.get('HOME_COLLECTION_TIER2_KM', 10)),
          tier2Fee: Number(this.config.get('HOME_COLLECTION_TIER2_FEE', 100)),
          tier3Km: Number(this.config.get('HOME_COLLECTION_TIER3_KM', 20)),
          tier3Fee: Number(this.config.get('HOME_COLLECTION_TIER3_FEE', 200)),
        },
        walletSignupBonus: Number(this.config.get('WALLET_SIGNUP_BONUS', 0)),
        otpLength: 6,
        otpResendSeconds: Number(this.config.get('OTP_RESEND_COOLDOWN_SECONDS', 30)),
        otpExpirySeconds: Number(this.config.get('OTP_TTL_SECONDS', 300)),
        cancellationWindowHours: Number(this.config.get('CANCELLATION_WINDOW_HOURS', 2)),
      },
    };
  }
}
