import { IsArray, IsIn, IsString, MinLength } from 'class-validator';

class LabCatalogueItemDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE';

  @IsString()
  @MinLength(1)
  itemId!: string;
}

export class SetOwnLabCatalogueDto {
  @IsArray()
  items!: LabCatalogueItemDto[];
}
