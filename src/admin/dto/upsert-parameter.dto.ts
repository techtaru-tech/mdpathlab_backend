import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';

export class UpsertParameterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsInt()
  @Min(0)
  mrp!: number;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsIn(['HOME', 'LAB', 'BOTH'])
  sampleCollection?: 'HOME' | 'LAB' | 'BOTH';

  @IsOptional()
  @IsInt()
  @Min(0)
  sampleCollectionFee?: number;

  @IsInt()
  @Min(0)
  reportTimeHours!: number;

  @IsOptional()
  @IsBoolean()
  fastingRequired?: boolean;

  @ValidateIf((dto: UpsertParameterDto) => Boolean(dto.fastingRequired))
  @IsInt()
  @Min(0)
  fastingHours?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayParameterCount?: number;
}
