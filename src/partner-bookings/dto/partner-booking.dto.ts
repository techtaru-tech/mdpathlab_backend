import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, Equals, IsArray, IsBoolean, IsIn, IsJWT, IsOptional, IsString, Matches, MaxLength, MinLength, Validate, ValidateNested } from 'class-validator';
import { IsValidCalendarDateConstraint } from '../../slots/dto/get-slots.dto.js';
import { UpsertAddressDto } from '../../patients/dto/upsert-address.dto.js';

const digits = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '') : value);

export class PatientPhoneDto {
  @Transform(digits)
  @Matches(/^[6-9]\d{9}$/, { message: "Enter the patient's 10-digit mobile number" })
  phone!: string;
}

export class VerifyPatientDto extends PatientPhoneDto {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit OTP the patient received' })
  otp!: string;

  // Saved on a new patient account (or one with no name yet); an existing name is never overwritten.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;
}

/** The short-lived token from verify — proof the patient gave their OTP to this partner. */
export class PatientTokenDto {
  @IsJWT({ message: "Verify the patient's mobile number again" })
  patientToken!: string;
}

export class PartnerAddressDto extends UpsertAddressDto {
  @IsJWT({ message: "Verify the patient's mobile number again" })
  patientToken!: string;
}

export class PartnerBookingItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE', 'RADIOLOGY'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY';

  @IsString()
  @MaxLength(40)
  itemId!: string;
}

export class PartnerQuoteDto extends PatientTokenDto {
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
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PartnerBookingItemDto)
  items!: PartnerBookingItemDto[];

  @IsOptional()
  @IsBoolean()
  printedReport?: boolean;
}

export class PartnerCreateBookingDto extends PartnerQuoteDto {
  @IsString()
  slotId!: string;

  @Validate(IsValidCalendarDateConstraint)
  scheduledDate!: string;

  // Required (true) with printedReport: the patient agreed to pay the courier / postage charges.
  @IsOptional()
  @IsBoolean()
  printedReportTermsAccepted?: boolean;

  // The partner confirms the patient asked for these tests — recorded on the booking.
  @IsBoolean()
  @Equals(true, { message: 'Please confirm the patient asked for this booking' })
  patientConsent!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
