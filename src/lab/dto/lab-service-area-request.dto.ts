import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateLabServiceAreaRequestDto {
  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit number' })
  pincode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
