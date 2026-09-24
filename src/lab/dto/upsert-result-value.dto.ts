import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertResultValueDto {
  @IsString()
  parameterId!: string;

  @IsString()
  @MinLength(1)
  value!: string;

  @IsOptional()
  @IsString()
  unit?: string;
}
