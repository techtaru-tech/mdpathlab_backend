import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, Matches, MinLength, ValidateIf, ValidateNested } from 'class-validator';

export class CreateLabDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;

  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;

  @IsOptional()
  @IsArray()
  @Matches(/^\d{6}$/, { each: true, message: 'each pincode must be a 6-digit number' })
  servicePincodes?: string[];

  // Printed on the auto-generated report's letterhead/footer (see ReportGeneratorService).
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  accreditationNumber?: string;

  @IsOptional()
  @IsString()
  pathologistName?: string;

  @IsOptional()
  @IsString()
  pathologistQualification?: string;

  // The lab's map pin — used for the additional collection charge (distance to the patient's address pin).
  // null clears it.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsLatitude()
  lat?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsLongitude()
  lng?: number | null;
}

export class UpdateLabDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone?: string;

  @IsOptional()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsArray()
  @Matches(/^\d{6}$/, { each: true, message: 'each pincode must be a 6-digit number' })
  servicePincodes?: string[];

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  accreditationNumber?: string;

  @IsOptional()
  @IsString()
  pathologistName?: string;

  @IsOptional()
  @IsString()
  pathologistQualification?: string;

  // The lab's map pin — used for the additional collection charge (distance to the patient's address pin).
  // null clears it.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsLatitude()
  lat?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsLongitude()
  lng?: number | null;
}

class LabCatalogueItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE', 'RADIOLOGY'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY';

  @IsString()
  @MinLength(1)
  itemId!: string;
}

export class SetLabCatalogueDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabCatalogueItemDto)
  items!: LabCatalogueItemDto[];
}
