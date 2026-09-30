import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CityPriceDto } from './city-price.dto.js';

export class UpsertParameterDto {
  // Absolute URL, or a path under /uploads. Shown on the customer app's Home screen.
  @IsOptional()
  @IsString()
  imageUrl?: string;

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

  // Printed on the auto-generated report next to the lab's entered value, e.g.
  // "13.0 - 17.0 g/dL" (see ReportGeneratorService).
  @IsOptional()
  @IsString()
  referenceRange?: string;

  // City-wise price overrides — a city not listed here just uses mrp/price above.
  @IsOptional()
  @IsArray()
  @ArrayUnique((cp: CityPriceDto) => cp.cityId)
  @ValidateNested({ each: true })
  @Type(() => CityPriceDto)
  cityPrices?: CityPriceDto[];
}
