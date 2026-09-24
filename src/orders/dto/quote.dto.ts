import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CheckoutItemDto } from './checkout.dto.js';

export class QuoteDto {
  @IsIn(['HOME', 'CENTER'])
  collectionType!: 'HOME' | 'CENTER';

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  collectionCenterId?: string;

  // The customer's selected city (header location picker) — applies that city's CityPrice
  // override, when one exists, to each item instead of its default mrp/price.
  @IsOptional()
  @IsString()
  cityId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsBoolean()
  useWallet?: boolean;
}
