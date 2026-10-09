import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
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

  // Continuing a booking from a reviewed prescription — forces the same lab the prescription was
  // assigned to instead of re-matching by address pincode (see OrdersService.priceOrder).
  @IsOptional()
  @IsString()
  prescriptionId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
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
