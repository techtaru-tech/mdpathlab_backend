import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PackageItemDto {
  @IsIn(['PARAMETER', 'PROFILE'])
  itemType!: 'PARAMETER' | 'PROFILE';

  @IsString()
  @MinLength(1)
  itemId!: string;
}

export class UpsertPackageDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

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

  @ValidateIf((dto: UpsertPackageDto) => Boolean(dto.fastingRequired))
  @IsInt()
  @Min(0)
  fastingHours?: number;

  @IsOptional()
  @IsString()
  bestFor?: string;

  @IsOptional()
  @IsString()
  badge?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  highlights?: string[];

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  // Included items — reuses the existing PackageItem PARAMETER|PROFILE polymorphism, never a
  // parallel relationship.
  @IsOptional()
  @IsArray()
  @ArrayUnique((item: PackageItemDto) => `${item.itemType}:${item.itemId}`)
  @ValidateNested({ each: true })
  @Type(() => PackageItemDto)
  items?: PackageItemDto[];
}
