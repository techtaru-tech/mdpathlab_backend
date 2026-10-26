import { IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';

export class RequestPartnerOtpDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;
}

export class VerifyPartnerOtpDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;

  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;

  // Which portal account this login is for — the same mobile may be both a doctor and a clinic's contact.
  @IsIn(['DOCTOR', 'CLINIC'])
  type!: 'DOCTOR' | 'CLINIC';

  // Required (true) only when this login creates a new partner account.
  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;
}
