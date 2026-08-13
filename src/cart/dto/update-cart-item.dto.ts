import { IsOptional, IsString } from 'class-validator';

export class UpdateCartItemDto {
  // Empty string clears the assignment (books the item for the account holder themselves).
  @IsOptional()
  @IsString()
  familyMemberId?: string;
}
