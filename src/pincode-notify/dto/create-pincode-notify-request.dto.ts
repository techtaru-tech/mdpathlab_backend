import { Matches } from 'class-validator';

export class CreatePincodeNotifyRequestDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;

  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit number' })
  pincode!: string;
}
