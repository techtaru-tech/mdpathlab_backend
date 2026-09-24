import { IsIn, IsOptional, IsString } from 'class-validator';

export class LabUpdateOrderStatusDto {
  @IsIn(['CONFIRMED', 'PHLEBOTOMIST_ASSIGNED', 'SAMPLE_COLLECTED', 'IN_LAB', 'CANCELLED'])
  status!: 'CONFIRMED' | 'PHLEBOTOMIST_ASSIGNED' | 'SAMPLE_COLLECTED' | 'IN_LAB' | 'CANCELLED';

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  phlebotomistId?: string;
}
