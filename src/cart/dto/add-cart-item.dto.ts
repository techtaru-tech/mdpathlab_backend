import { IsIn, IsOptional, IsString } from 'class-validator';

export class AddCartItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE';

  @IsString()
  itemId!: string;

  @IsOptional()
  @IsString()
  familyMemberId?: string;
}
