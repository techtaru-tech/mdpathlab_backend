import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class AssignHomeVisitDto {
  @IsString()
  phlebotomistId!: string;

  // Expected arrival time, shown to the customer.
  @IsOptional()
  @IsISO8601()
  eta?: string;
}

export class UpdateHomeVisitStatusDto {
  @IsIn(['ON_THE_WAY', 'ARRIVED', 'NO_SHOW', 'CANCELLED'])
  status!: 'ON_THE_WAY' | 'ARRIVED' | 'NO_SHOW' | 'CANCELLED';

  @IsOptional()
  @IsISO8601()
  eta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class HomeVisitItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE', 'RADIOLOGY'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY';

  @IsString()
  itemId!: string;
}

export class AddHomeVisitItemsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one test' })
  @ValidateNested({ each: true })
  @Type(() => HomeVisitItemDto)
  items!: HomeVisitItemDto[];
}
