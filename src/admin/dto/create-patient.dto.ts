import { IsDateString, IsEmail, IsIn, IsOptional, IsString, Matches } from 'class-validator';

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
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  city?: string;
}
