import { IsIn, IsOptional, IsString } from 'class-validator';

export class AddCartItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE', 'RADIOLOGY'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY';

  @IsString()
  itemId!: string;

  @IsOptional()
  @IsString()
  familyMemberId?: string;
}
