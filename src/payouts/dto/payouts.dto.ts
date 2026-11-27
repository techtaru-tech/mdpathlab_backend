import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value);

export class SaveBankAccountDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z .'-]{1,99}$/, { message: 'Enter the account holder name as it appears on the bank account' })
  accountHolderName!: string;

  // Indian bank account numbers are 9–18 digits.
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '') : value))
  @Matches(/^\d{9,18}$/, { message: 'Account number must be 9 to 18 digits' })
  accountNumber!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value))
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'Enter a valid 11-character IFSC code (e.g. SBIN0001234)' })
  ifsc!: string;
}

export class RequestWithdrawalDto {
  // Whole rupees.
  @Type(() => Number)
  @IsInt({ message: 'Enter the amount in whole rupees' })
  @Min(1)
  @Max(10_000_000)
  amountRupees!: number;
}

export class UpdateCommissionSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  ratePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  holdDays?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(1_000_000)
  minWithdrawalRupees?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(30)
  tdsPercent?: number;

  // The MOU terms with {placeholders}; null or empty = back to the standard draft. Used for MOUs made from now on.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(30_000)
  mouTerms?: string | null;

  // Optional: every change is audited (who, when, before → after) with or without one.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class WithdrawalDecisionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class MarkPaidDto {
  // Bank transaction reference (UTR / RRN).
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value))
  @Matches(/^[A-Z0-9]{6,30}$/, { message: 'Enter the bank transaction reference (UTR), 6–30 letters/digits' })
  utr!: string;
}

export class AdjustmentDto {
  // Rupees with up to 2 decimals; positive credits the partner, negative debits.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-1_000_000)
  @Max(1_000_000)
  @NotEquals(0)
  amountRupees!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export const RATE_ITEM_TYPES = ['PARAMETER', 'PROFILE', 'PACKAGE', 'RADIOLOGY'] as const;
export type RateItemType = (typeof RATE_ITEM_TYPES)[number];

export class RatesQueryDto {
  @IsIn(RATE_ITEM_TYPES)
  type!: RateItemType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

export class RateChangeDto {
  @IsIn(RATE_ITEM_TYPES)
  itemType!: RateItemType;

  @IsString()
  @MaxLength(40)
  itemId!: string;

  // null (or left out) = no own rate, the default rate applies.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  ratePercent?: number | null;
}

export class SetRatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RateChangeDto)
  changes!: RateChangeDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class WithdrawalListQueryDto {
  @IsOptional()
  @IsIn(['REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED'])
  status?: 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

// ---------------------------------------------------------------- partner MOU, categories, statements, report

export class CreateMouDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter a percentage with up to 2 decimals' })
  @Min(0)
  @Max(50, { message: 'A commission rate can be at most 50%' })
  routinePercent!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter a percentage with up to 2 decimals' })
  @Min(0)
  @Max(50, { message: 'A commission rate can be at most 50%' })
  specialPercent!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter a percentage with up to 2 decimals' })
  @Min(0)
  @Max(50, { message: 'A commission rate can be at most 50%' })
  packagePercent!: number;

  // IST date the MOU starts (today or later). Left out = from now.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter the start date as YYYY-MM-DD' })
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export const CATEGORY_ITEM_TYPES = ['PARAMETER', 'PROFILE', 'RADIOLOGY'] as const;

export class CategoryChangeDto {
  // Packages are always "Package" — they can't be re-categorised.
  @IsIn(CATEGORY_ITEM_TYPES)
  itemType!: (typeof CATEGORY_ITEM_TYPES)[number];

  @IsString()
  @MaxLength(40)
  itemId!: string;

  @IsIn(['ROUTINE', 'SPECIAL'])
  category!: 'ROUTINE' | 'SPECIAL';
}

export class SetCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CategoryChangeDto)
  changes!: CategoryChangeDto[];
}

export class StatementQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Choose a month (YYYY-MM)' })
  month!: string;
}

export class ReportQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter the start date as YYYY-MM-DD' })
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter the end date as YYYY-MM-DD' })
  to!: string;
}
