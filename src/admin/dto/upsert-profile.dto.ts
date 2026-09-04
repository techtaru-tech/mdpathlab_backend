import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';

export class UpsertProfileDto {
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

  @IsOptional()
  @IsString()
  sampleType?: string;

  @IsOptional()
  @IsString()
  preparationInstructions?: string;

  @IsInt()
  @Min(0)
  mrp!: number;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsIn(['HOME', 'LAB', 'BOTH'])
  sampleCollection?: 'HOME' | 'LAB' | 'BOTH';

  @IsInt()
  @Min(0)
  reportTimeHours!: number;

  @IsOptional()
  @IsBoolean()
  fastingRequired?: boolean;

  @ValidateIf((dto: UpsertProfileDto) => Boolean(dto.fastingRequired))
  @IsInt()
  @Min(0)
  fastingHours?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsString()
  tag?: string;

  // The "Parameters Covered" multi-select — a list of real Parameter ids, saved as
  // ProfileParameter rows. Never a free-text/comma-separated field.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  parameterIds?: string[];
}
