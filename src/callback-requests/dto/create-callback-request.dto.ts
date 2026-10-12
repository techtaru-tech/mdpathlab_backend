import { Validate, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { isGenuineIndianMobile } from '../../common/mobile-number.js';

@ValidatorConstraint({ name: 'genuineIndianMobile' })
class GenuineIndianMobile implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isGenuineIndianMobile(value);
  }
  defaultMessage() {
    return 'Please enter a valid 10-digit mobile number.';
  }
}

export class CreateCallbackRequestDto {
  @Validate(GenuineIndianMobile)
  phone!: string;
}
