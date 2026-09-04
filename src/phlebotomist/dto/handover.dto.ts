import { IsNotEmpty, IsString } from 'class-validator';

// FSD §2.5: "Scan/Enter Sample Barcode" — no format assumed (scanner or manual entry both arrive
// here as plain text); only presence is validated.
export class HandoverDto {
  @IsString()
  @IsNotEmpty()
  sampleBarcode!: string;
}
