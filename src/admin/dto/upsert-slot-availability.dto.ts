import { IsIn, IsInt, IsOptional, IsString, Min, Validate } from 'class-validator';
import { IsValidCalendarDateConstraint } from '../../slots/dto/get-slots.dto.js';

export class CreateSlotAvailabilityDto {
  @IsString()
  slotId!: string;

  @Validate(IsValidCalendarDateConstraint)
  date!: string;

  // Absent = global (applies to HOME and CENTER alike). Business-rule checks beyond basic shape
  // (HOME cannot carry a collectionCenterId; a centre must actually exist) happen in the
  // controller, since they need a DB lookup — not expressible as a static decorator.
  @IsOptional()
  @IsIn(['HOME', 'CENTER'])
  collectionType?: 'HOME' | 'CENTER';

  @IsOptional()
  @IsString()
  collectionCenterId?: string;

  @IsInt()
  @Min(0)
  capacity!: number;
}

// Only capacity is editable. The scope-defining fields (slot/date/collectionType/centre) form the
// row's identity against the partial unique indexes — changing them after creation would mean
// silently moving a configuration to a different scope, which is indistinguishable from a mistake.
// Deleting and recreating is the explicit way to change scope.
export class UpdateSlotAvailabilityDto {
  @IsInt()
  @Min(0)
  capacity!: number;
}
