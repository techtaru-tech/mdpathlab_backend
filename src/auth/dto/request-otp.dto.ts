import { IsIn, IsOptional, Matches } from 'class-validator';

export class RequestOtpDto {
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;

  @IsOptional()
  @IsIn(['LOGIN', 'SIGNUP'])
  purpose?: 'LOGIN' | 'SIGNUP';
}
