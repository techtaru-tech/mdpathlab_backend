import { IsString, MinLength } from 'class-validator';

export class ActivateCouponDto {
  @IsString()
  @MinLength(1)
  code!: string;
}
