import { IsString } from 'class-validator';

export class ReassignPrescriptionLabDto {
  @IsString()
  labId!: string;
}
