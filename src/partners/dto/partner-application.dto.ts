import { Transform, Type } from 'class-transformer';
import { Equals, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MEDICAL_COUNCILS_UPPER } from '../medical-councils.js';
import { normalizeAuthority } from '../partner-normalize.js';

export class DoctorApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  // Any case / spacing of a listed council is accepted ("rajasthan  medical council"); anything else is refused.
  @Transform(({ value }) => (typeof value === 'string' ? normalizeAuthority(value) : value))
  @IsIn(MEDICAL_COUNCILS_UPPER, { message: 'Please choose your medical council from the list' })
  medicalCouncil!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9 /.-]{2,40}$/, { message: 'Registration number may contain letters, digits, spaces and / . - only' })
  registrationNumber!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  registrationYear?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  qualification!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialization?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit number' })
  pincode!: string;
}

export class ClinicApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  clinicName!: string;

  @IsString()
  @MaxLength(40)
  clinicTypeCode!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  registrationAuthority?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9 /.-]{0,60}$/, { message: 'Registration number may contain letters, digits, spaces and / . - only' })
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\s*|\d{2}[A-Za-z]{5}\d{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z])$/, { message: 'GSTIN must be a valid 15-character GST number' })
  gstin?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(400)
  address!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit number' })
  pincode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  contactPersonName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactPersonDesignation?: string;
}

export class SubmitPartnerApplicationDto {
  // "I confirm the details and documents are genuine and I am authorised to submit them."
  @Equals(true, { message: 'Please accept the declaration to submit your application' })
  declarationAccepted!: boolean;
}

export class RequestAffiliationDto {
  @IsString()
  @MaxLength(40)
  clinicPartnerId!: string;
}

export class AffiliationNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SearchClinicsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}

export class RequirementsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  clinicTypeCode?: string;
}
