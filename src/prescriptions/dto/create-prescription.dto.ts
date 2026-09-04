import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePrescriptionDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
