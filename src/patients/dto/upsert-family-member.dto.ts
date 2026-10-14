import { NormalizeGender, NumberFromString } from '../../common/gender.js';
import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpsertFamilyMemberDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(40)
  relation!: string;

  @IsOptional()
  @NormalizeGender()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  @IsOptional()
  @IsISO8601()
  dob?: string;

  @IsOptional()
  @NumberFromString()
  @IsInt()
  @Min(0)
  @Max(120)
  age?: number;
}
