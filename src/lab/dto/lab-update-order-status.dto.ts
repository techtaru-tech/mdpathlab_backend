import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, Validate } from 'class-validator';
import { IsValidCalendarDateConstraint } from '../../slots/dto/get-slots.dto.js';

export class LabUpdateOrderStatusDto {
  @IsIn(['CONFIRMED', 'PHLEBOTOMIST_ASSIGNED', 'SAMPLE_COLLECTED', 'IN_LAB', 'CANCELLED'])
  status!: 'CONFIRMED' | 'PHLEBOTOMIST_ASSIGNED' | 'SAMPLE_COLLECTED' | 'IN_LAB' | 'CANCELLED';

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  phlebotomistId?: string;

  // Explicit human confirmation for an assignment whose travel time couldn't be verified (an
  // address has no map location). Never overrides a real time/travel conflict.
  @IsOptional()
  @IsBoolean()
  confirmUnverifiedTravel?: boolean;
}

export class LabReactivateOrderDto {
  @Validate(IsValidCalendarDateConstraint)
  scheduledDate!: string;

  @IsString()
  @IsNotEmpty()
  slotId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
