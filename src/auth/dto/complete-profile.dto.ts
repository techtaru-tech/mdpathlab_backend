import { Transform } from 'class-transformer';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class CompleteProfileDto {
  @IsString()
  name!: string;

  // Required — reports, booking details and receipts are emailed here. Trimmed and lower-cased so
  // "Ravi@Gmail.com " and "ravi@gmail.com" are the same address.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

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
