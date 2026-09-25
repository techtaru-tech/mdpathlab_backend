import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectAssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
