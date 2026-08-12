import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CheckoutDto {
  @IsIn(['HOME', 'CENTER'])
  collectionType!: 'HOME' | 'CENTER';

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
