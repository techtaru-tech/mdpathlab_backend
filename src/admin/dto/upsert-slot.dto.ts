import { IsBoolean, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';

// Matches the "HH:mm" convention every existing Slot row already uses (see ist-time.ts's
// istInstant()/isPastIstSlot(), which parse this exact shape) — not a new format.
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export class CreateSlotDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @Matches(TIME_PATTERN, { message: 'startTime must be in HH:mm format' })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: 'endTime must be in HH:mm format' })
  endTime!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSlotDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime must be in HH:mm format' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime must be in HH:mm format' })
  endTime?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
