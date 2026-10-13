import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;

  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;

  // The login screen's "I agree to the Terms & Conditions and Privacy Policy" checkbox. Optional so older app
  // versions that never send it keep logging in.
  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;

  // The app's Firebase push token, saved for this account as part of the login (optional — login works without it).
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  fcmToken?: string;

  @IsOptional()
  @IsIn(['ANDROID', 'IOS', 'WEB'])
  platform?: 'ANDROID' | 'IOS' | 'WEB';
}
