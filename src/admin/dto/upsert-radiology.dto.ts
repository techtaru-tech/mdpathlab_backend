import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';

// Deliberately lighter than UpsertProfileDto (no parameterIds/cityPrices/CSV import) — radiology
// is a simple admin-add catalogue, not a bundle of Parameters, and doesn't (yet) need per-city
// pricing overrides or bulk CSV import like Tests/Packages do.
export class UpsertRadiologyDto {
  // Absolute URL, or a path under /uploads. Shown on the customer app's Home screen.
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsString()
  @MinLength(1)
  testCode!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  // Free text, e.g. "X-Ray", "CT Scan", "MRI", "Ultrasound".
  @IsOptional()
  @IsString()
  modality?: string;

  @IsOptional()
  @IsString()
  preparationInstructions?: string;

  @IsInt()
  @Min(0)
  mrp!: number;

  @IsInt()
  @Min(0)
  price!: number;

  @IsInt()
  @Min(0)
  reportTimeHours!: number;

  @IsOptional()
  @IsBoolean()
  fastingRequired?: boolean;

  @ValidateIf((dto: UpsertRadiologyDto) => Boolean(dto.fastingRequired))
  @IsInt()
  @Min(0)
  fastingHours?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsString()
  tag?: string;
}
