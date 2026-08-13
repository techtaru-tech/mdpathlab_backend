import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
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

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsOptional()
  @IsString()
  couponCode?: string;
}
