import { IsString, MaxLength, MinLength } from 'class-validator';

export class PrescriptionClarificationReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reply!: string;
}
