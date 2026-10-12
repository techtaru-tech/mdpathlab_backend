import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, Validate, ValidateNested } from 'class-validator';
import { IsValidCalendarDateConstraint } from '../../slots/dto/get-slots.dto.js';

export class CheckoutItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE', 'RADIOLOGY'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY';

  @IsString()
  itemId!: string;

  @IsOptional()
  @IsString()
  familyMemberId?: string;
}

// What is being booked — shared by POST /orders/checkout/razorpay-order (pay first) and POST /orders/checkout.
export class CheckoutRequestDto {
  @IsIn(['HOME', 'CENTER'])
  collectionType!: 'HOME' | 'CENTER';

  // Optional — when provided, checkout books exactly these items instead of whatever
  // happens to be sitting in the shared per-user cart at submit time. The cart is a
  // single bucket per account with no session/tab scoping, so relying on it alone lets
  // a second tab or a later page visit clear it out from under an in-progress booking.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items?: CheckoutItemDto[];

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  collectionCenterId?: string;

  // Same city-price override as QuoteDto.cityId — kept identical between the two so the total
  // quote() showed is guaranteed to match what checkout() actually charges.
  @IsOptional()
  @IsString()
  cityId?: string;

  // Same as QuoteDto.prescriptionId — forces this order's lab to match the prescription's
  // already-assigned lab, and links the order back to it on success.
  @IsOptional()
  @IsString()
  prescriptionId?: string;

  @IsString()
  slotId!: string;

  // A real calendar date, YYYY-MM-DD (the app and website both send exactly this).
  @Validate(IsValidCalendarDateConstraint)
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  // Redeems as much of the user's wallet balance as the order allows (capped at subtotal minus
  // discount plus fee) — an all-or-nothing-up-to-the-cap toggle rather than a manual amount, so
  // there's no separate "amount exceeds balance" or "amount exceeds order total" input to validate.
  @IsOptional()
  @IsBoolean()
  useWallet?: boolean;

}

// Step 1 of an online payment. paymentMethod is accepted (the app may send it) but this is always online.
export class RazorpayCheckoutOrderDto extends CheckoutRequestDto {
  @IsOptional()
  @IsIn(['ONLINE'])
  paymentMethod?: 'ONLINE';
}

export class CheckoutDto extends CheckoutRequestDto {
  // CASH is the app's name for pay at collection; it is stored as COD.
  @IsIn(['ONLINE', 'COD', 'CASH'])
  paymentMethod!: 'ONLINE' | 'COD' | 'CASH';

  // Payment proof from the Razorpay sheet (pay first, then book). Field names are Razorpay's own.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  razorpay_order_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  razorpay_payment_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  razorpay_signature?: string;
}
