import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, Validate, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { isGenuineIndianMobile } from '../../common/mobile-number.js';

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'] as const;
export const APPLICATION_STATUSES = ['NEW', 'SHORTLISTED', 'REJECTED', 'HIRED'] as const;

@ValidatorConstraint({ name: 'genuineIndianMobile' })
class GenuineIndianMobile implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isGenuineIndianMobile(value);
  }
  defaultMessage() {
    return 'Please enter a valid 10-digit mobile number.';
  }
}

// Admin and lab use the same form. Every field is optional on edit (PATCH) — only what is sent changes.
export class UpsertJobOpeningDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  experience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  salary?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  openings?: number;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  requirements?: string;

  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: 'OPEN' | 'CLOSED';
}

// Sent as multipart/form-data (the résumé is the optional `resume` file), so every field arrives as text.
export class ApplyJobDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @Validate(GenuineIndianMobile)
  phone!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please enter a valid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  experience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class UpdateApplicationStatusDto {
  @IsIn(APPLICATION_STATUSES)
  status!: (typeof APPLICATION_STATUSES)[number];
}
