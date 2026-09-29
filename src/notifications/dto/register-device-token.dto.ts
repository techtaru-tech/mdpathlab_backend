import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;

  // WEB = this repo's own browser client (Firebase Web Push). ANDROID/IOS = a native app talking
  // to this same API (e.g. the phlebotomist Flutter app) registering its own native FCM token —
  // that token is only ever usable for sending if the native app was built against the SAME
  // Firebase project this backend's FirebaseService sends from (see its .env comment).
  @IsOptional()
  @IsIn(['WEB', 'ANDROID', 'IOS'])
  platform?: 'WEB' | 'ANDROID' | 'IOS';
}
