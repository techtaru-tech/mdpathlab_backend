import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateContactQueryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(1)
  message!: string;
}
