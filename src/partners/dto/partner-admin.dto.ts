import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PARTNER_DOCUMENT_KINDS, type PartnerDocumentKind } from '../partner-document-kinds.js';

export class ListPartnersQueryDto {
  @IsOptional()
  @IsIn(['DOCTOR', 'CLINIC'])
  type?: 'DOCTOR' | 'CLINIC';

  @IsOptional()
  @IsIn(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'])
  status?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

// Approve may carry an optional note; reject / suspend / reactivate require a reason (checked in the service, so
// the rule lives next to the transition table).
export class PartnerDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class AdminCreateAffiliationDto {
  @IsString()
  @MaxLength(40)
  doctorPartnerId!: string;

  @IsString()
  @MaxLength(40)
  clinicPartnerId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class AdminAffiliationDecisionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class CreateClinicTypeDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, { message: 'code must be UPPER_CASE letters, digits or _ (e.g. EYE_HOSPITAL)' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsBoolean()
  registrationNumberRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  registrationNumberLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateFeatureSwitchesDto {
  @IsOptional()
  @IsBoolean()
  referralPartnersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  referralsEnabled?: boolean;
}

export class UpdateClinicTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsBoolean()
  registrationNumberRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  registrationNumberLabel?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class RequirementsScopeQueryDto {
  @IsIn(['DOCTOR', 'CLINIC'])
  partnerType!: 'DOCTOR' | 'CLINIC';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clinicTypeCode?: string;
}

class RequirementItemDto {
  @IsIn(PARTNER_DOCUMENT_KINDS as unknown as string[])
  documentKind!: PartnerDocumentKind;

  @IsIn(['MANDATORY', 'OPTIONAL'])
  level!: 'MANDATORY' | 'OPTIONAL';
}

export class ReplaceRequirementsDto {
  @IsIn(['DOCTOR', 'CLINIC'])
  partnerType!: 'DOCTOR' | 'CLINIC';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clinicTypeCode?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RequirementItemDto)
  items!: RequirementItemDto[];

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
