import { IsIn, Matches, Validate } from 'class-validator';
import type { ValidationArguments, ValidatorConstraintInterface } from 'class-validator';
import { ValidatorConstraint } from 'class-validator';
import { isValidCalendarDateString } from '../../common/ist-time.js';

@ValidatorConstraint({ name: 'isValidCalendarDate' })
class IsValidCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidCalendarDateString(value);
  }
  defaultMessage() {
    return 'date must be a real calendar date in YYYY-MM-DD format';
  }
}

// Deliberately not @IsOptional() + @IsString() — @IsOptional() would skip this custom validator
// entirely whenever the value is absent, which is exactly the case (CENTER with no centre id)
// this needs to catch. This single constraint both type-checks the value when present and
// enforces "required for CENTER, not required for HOME".
@ValidatorConstraint({ name: 'collectionCenterIdValidForScope' })
class CollectionCenterIdValidForScopeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    const dto = args.object as GetSlotsDto;
    if (dto.collectionType === 'CENTER') return typeof value === 'string' && value.length > 0;
    return value === undefined || typeof value === 'string';
  }
  defaultMessage(args: ValidationArguments) {
    const dto = args.object as GetSlotsDto;
    return dto.collectionType === 'CENTER'
      ? 'collectionCenterId is required when collectionType is CENTER'
      : 'collectionCenterId must be a string';
  }
}

export class GetSlotsDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  @Validate(IsValidCalendarDateConstraint)
  date!: string;

  @IsIn(['HOME', 'CENTER'])
  collectionType!: 'HOME' | 'CENTER';

  @Validate(CollectionCenterIdValidForScopeConstraint)
  collectionCenterId?: string;
}
