import { IsBooleanString, IsOptional, IsString } from 'class-validator';

// Every field optional and arrives over multipart/form-data (plain strings, parsed in the
// controller) — this is a genuine partial update, so an admin editing just one tab's fields
// never has to resend the others. Blank string clears a plain field to null (matches the
// established "optional field clearing" convention elsewhere in this codebase); the two
// Razorpay secrets are the deliberate exception — see admin-settings.controller.ts.
export class UpdateSiteSettingsDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  appStoreUrl?: string;

  @IsOptional()
  @IsString()
  playStoreUrl?: string;

  @IsOptional()
  @IsString()
  privacyPolicyContent?: string;

  @IsOptional()
  @IsString()
  termsConditionsContent?: string;

  @IsOptional()
  @IsString()
  razorpayKeyId?: string;

  @IsOptional()
  @IsString()
  razorpayKeySecret?: string;

  @IsOptional()
  @IsString()
  razorpayWebhookSecret?: string;

  @IsOptional()
  @IsBooleanString()
  onlinePaymentEnabled?: string;

  @IsOptional()
  @IsBooleanString()
  codEnabled?: string;
}
