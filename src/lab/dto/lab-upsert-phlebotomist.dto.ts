import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class LabCreatePhlebotomistDto {
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
}

export class LabUpdatePhlebotomistDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'ON_LEAVE'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;
}
