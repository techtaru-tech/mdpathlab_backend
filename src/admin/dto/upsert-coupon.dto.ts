import { IsISO8601, IsIn, IsInt, IsOptional, IsPositive, IsString, Matches, Min, MinLength, ValidateIf } from 'class-validator';

export class CreateCouponDto {
  // Absolute URL, or a path under /uploads. Shown on the customer app's Home screen.
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code must be uppercase letters, numbers, hyphens or underscores only' })
  @MinLength(3)
  code!: string;

  @IsIn(['PERCENT', 'FLAT'])
  type!: 'PERCENT' | 'FLAT';

  @IsInt()
  @IsPositive()
  value!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscount?: number;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateCouponDto {
  // Absolute URL, or a path under /uploads. Shown on the customer app's Home screen.
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsIn(['PERCENT', 'FLAT'])
  type?: 'PERCENT' | 'FLAT';

  @IsOptional()
  @IsInt()
  @IsPositive()
  value?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderValue?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscount?: number | null;

  // null (or an empty value) clears the date; anything else must be a real date.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
