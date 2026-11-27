import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value);

export class UpdateAdminProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Enter your name' })
  @MaxLength(80)
  name?: string;

  // Indian mobile, or null / empty to clear it.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '') : value))
  @ValidateIf((_o, v) => v !== null && v !== '')
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a 10-digit mobile number' })
  phone?: string | null;
}

export class RequestEmailChangeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(120)
  newEmail!: string;

  @IsString()
  @MinLength(1, { message: 'Enter your current password' })
  currentPassword!: string;
}

export class RequestPasswordChangeDto {
  @IsString()
  @MinLength(1, { message: 'Enter your current password' })
  currentPassword!: string;
}

export class VerifyCodeDto {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the email' })
  code!: string;
}

export class ChangePasswordDto extends VerifyCodeDto {
  // At least 8 characters with a letter and a number.
  @IsString()
  @MinLength(8, { message: 'The new password must be at least 8 characters' })
  @MaxLength(100)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Use at least one letter and one number in the new password' })
  newPassword!: string;
}
