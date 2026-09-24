import { IsEmail, MinLength } from 'class-validator';

export class LabLoginDto {
  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;
}
