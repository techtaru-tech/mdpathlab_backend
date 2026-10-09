import { Type } from 'class-transformer';
import { IsArray, IsIn, IsString, MinLength, ValidateNested } from 'class-validator';

class LabCatalogueItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE', 'RADIOLOGY'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY';

  @IsString()
  @MinLength(1)
  itemId!: string;
}

export class SetOwnLabCatalogueDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabCatalogueItemDto)
  items!: LabCatalogueItemDto[];
}
