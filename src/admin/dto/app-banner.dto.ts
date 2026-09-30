import { IsIn, IsNumberString, IsOptional } from 'class-validator';

export class CreateAppBannerDto {
  // Arrives as a string over multipart/form-data.
  @IsOptional()
  @IsNumberString()
  sortOrder?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateAppBannerDto {
  @IsOptional()
  @IsNumberString()
  sortOrder?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
