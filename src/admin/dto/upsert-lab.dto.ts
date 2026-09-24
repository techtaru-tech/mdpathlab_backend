import { IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

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
}

class LabCatalogueItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE';

  @IsString()
  @MinLength(1)
  itemId!: string;
}

export class SetLabCatalogueDto {
  @IsArray()
  items!: LabCatalogueItemDto[];
}
