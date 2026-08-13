import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CheckoutItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE';

  @IsString()
  itemId!: string;

  @IsOptional()
  @IsString()
  familyMemberId?: string;
}

export class CheckoutDto {
  @IsIn(['HOME', 'CENTER'])
  collectionType!: 'HOME' | 'CENTER';

  // Optional — when provided, checkout books exactly these items instead of whatever
  // happens to be sitting in the shared per-user cart at submit time. The cart is a
  // single bucket per account with no session/tab scoping, so relying on it alone lets
  // a second tab or a later page visit clear it out from under an in-progress booking.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items?: CheckoutItemDto[];

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  collectionCenterId?: string;

  @IsString()
  slotId!: string;

  @IsISO8601()
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsIn(['ONLINE', 'COD'])
  paymentMethod!: 'ONLINE' | 'COD';
}
