import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, Validate, ValidateNested } from 'class-validator';
import { CheckoutItemDto } from '../../orders/dto/checkout.dto.js';
import { IsValidCalendarDateConstraint } from '../../slots/dto/get-slots.dto.js';

// POST /admin/orders (and /admin/orders/quote): a booking admin makes for a patient — by phone, at the counter,
// or on their behalf. Priced, routed and slot-checked exactly like the patient's own checkout; pay on collection.
export class AdminCreateBookingDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

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
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsString()
  slotId!: string;

  @Validate(IsValidCalendarDateConstraint)
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;

  // Shown in the booking's status history, e.g. "Booked over the phone".
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

// PATCH /admin/orders/:id — only what is sent changes. `items` is the complete new list of tests.
export class AdminEditBookingDto {
  @IsOptional()
  @Validate(IsValidCalendarDateConstraint)
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  slotId?: string;

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  collectionCenterId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items?: CheckoutItemDto[];

  // Why it was changed — kept in the status history and told to the patient.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
