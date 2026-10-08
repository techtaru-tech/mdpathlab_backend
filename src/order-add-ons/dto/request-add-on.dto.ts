import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class AddOnItemDto {
  // Radiology is a walk-in imaging visit, never something a phlebotomist can add at a home collection.
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE';

  @IsString()
  itemId!: string;

  // Optional: which family member the test is for. Defaults to the patient of the booking's first test.
  @IsOptional()
  @IsString()
  familyMemberId?: string;
}

export class RequestAddOnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AddOnItemDto)
  items!: AddOnItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
