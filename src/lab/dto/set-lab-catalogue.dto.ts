import { IsArray, IsIn, IsString, MinLength } from 'class-validator';

class LabCatalogueItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE', 'RADIOLOGY'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY';

  @IsString()
  @MinLength(1)
  itemId!: string;
}

export class SetOwnLabCatalogueDto {
  @IsArray()
  items!: LabCatalogueItemDto[];
}
