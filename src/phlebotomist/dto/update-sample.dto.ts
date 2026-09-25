import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSampleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tubeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  quantity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  collected?: boolean;
}
