import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePrescriptionStatusDto {
  @IsIn(['PENDING', 'REVIEWED'])
  status!: 'PENDING' | 'REVIEWED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}
