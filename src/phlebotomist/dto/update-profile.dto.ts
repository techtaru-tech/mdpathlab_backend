import { Transform } from 'class-transformer';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// What a phlebotomist may change about themselves. Phone has its own OTP flow
// (/auth/phlebotomist/change-phone/*); employee code, status, lab and coverage city are set by the lab/admin.
export class UpdatePhlebotomistProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehicleNumber?: string;

  // Multipart text field — send "true" (with no new photo) to delete the current profile photo.
  @IsOptional()
  @IsIn(['true', 'false'])
  removePhoto?: string;
}
