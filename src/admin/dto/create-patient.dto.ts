import { NormalizeGender } from '../../common/gender.js';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class CreatePatientDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @NormalizeGender()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  city?: string;
}

// Edit from admin — every field optional; only what is sent changes. An empty email / dob / city clears it.
export class UpdatePatientDto {
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== '')
  @IsEmail({}, { message: 'Please enter a valid email address' })
  email?: string;

  @IsOptional()
  @NormalizeGender()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  @IsOptional()
  @ValidateIf((_o, v) => v !== '')
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  city?: string;
}
