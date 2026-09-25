import { IsString, Length } from 'class-validator';

export class VerifyCollectionOtpDto {
  @IsString()
  @Length(4, 4)
  code!: string;
}
