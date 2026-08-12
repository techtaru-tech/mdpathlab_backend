import { IsNumber, IsString, Min } from 'class-validator';

export class ApplyCouponDto {
  @IsString()
  code!: string;

  @IsNumber()
  @Min(0)
  subtotal!: number;
}
