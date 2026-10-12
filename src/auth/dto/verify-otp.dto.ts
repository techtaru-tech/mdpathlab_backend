import { IsBoolean, IsOptional, Matches } from 'class-validator';

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
}
