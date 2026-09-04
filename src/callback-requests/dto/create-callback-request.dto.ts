import { Matches } from 'class-validator';

export class CreateCallbackRequestDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;
}
