import { Matches } from 'class-validator';

export class RequestPhoneChangeDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'newPhone must be a valid 10-digit Indian mobile number' })
  newPhone!: string;
}

export class VerifyPhoneChangeDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'newPhone must be a valid 10-digit Indian mobile number' })
  newPhone!: string;

  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;
}
