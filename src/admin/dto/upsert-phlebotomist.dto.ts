import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePhlebotomistDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  coverageCity?: string;

  // The partner lab this phlebotomist works for — only that lab sees them and can assign them bookings.
  @IsOptional()
  @IsString()
  labId?: string;
}

export class UpdatePhlebotomistDto {
  // A lab id to move them to that lab, or null to unlink them from any lab.
  @IsOptional()
  @IsString()
  labId?: string | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'ON_LEAVE'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

  @IsOptional()
  @IsString()
  coverageCity?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;
}
