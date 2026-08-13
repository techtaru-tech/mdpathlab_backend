import { IsDateString, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class CompleteProfileDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  city?: string;
}
