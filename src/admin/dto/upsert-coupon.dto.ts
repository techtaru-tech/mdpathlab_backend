import { IsIn, IsInt, IsOptional, IsPositive, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateCouponDto {
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
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
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

  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @IsOptional()
  @IsString()
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
