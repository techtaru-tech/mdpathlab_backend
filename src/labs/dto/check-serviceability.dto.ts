import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Matches, MinLength, ValidateNested } from 'class-validator';

class ServiceabilityItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE';

  @IsString()
  @MinLength(1)
  itemId!: string;
}

export class CheckServiceabilityDto {
  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit number' })
  pincode!: string;

  // Optional — with no items, this only checks whether ANY lab covers the pincode at all (used
  // e.g. while the customer is still browsing, before a cart exists). Checkout always passes the
  // real cart items, since a lab must cover every item in the order, not just the address.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => ServiceabilityItemDto)
  items?: ServiceabilityItemDto[];
}
