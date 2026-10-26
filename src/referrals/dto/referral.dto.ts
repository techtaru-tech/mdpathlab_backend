import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ClaimReferralDto {
  @IsString()
  @MaxLength(20)
  code!: string;

  @IsOptional()
  @IsIn(['LINK', 'QR', 'CODE_ENTRY'])
  source?: 'LINK' | 'QR' | 'CODE_ENTRY';

  // When the link was first opened in this browser — informational only, never trusted.
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;
}

export class AdminReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class AdminAssignReferralDto extends AdminReasonDto {
  @IsString()
  @MaxLength(40)
  partnerId!: string;
}

export class FindPatientQueryDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;
}

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number;

  @IsOptional()
  @IsIn(['BOUND', 'ALREADY_REFERRED', 'EXISTING_CUSTOMER', 'SELF_REFERRAL', 'PARTNER_NOT_ACTIVE', 'INVALID_CODE'])
  outcome?: 'BOUND' | 'ALREADY_REFERRED' | 'EXISTING_CUSTOMER' | 'SELF_REFERRAL' | 'PARTNER_NOT_ACTIVE' | 'INVALID_CODE';
}
