import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePrescriptionDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Used to route the prescription to the partner lab covering this pincode (see
  // LabsService.findMatchingLab) — optional since not every caller knows it yet.
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Pincode must be a 6-digit number' })
  pincode?: string;
}
