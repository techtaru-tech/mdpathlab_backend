import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LogoutDto {
  // This device's push token, removed so the phone stops getting this account's notifications.
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  fcmToken?: string;
}
