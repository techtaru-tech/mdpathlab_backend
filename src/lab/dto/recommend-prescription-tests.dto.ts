import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class RecommendedTestInputDto {
  @IsIn(['PARAMETER', 'PROFILE', 'PACKAGE'])
  itemType!: 'PARAMETER' | 'PROFILE' | 'PACKAGE';

  @IsString()
  itemId!: string;

  // false = the lab identified this as a doctor-recommended test but can't actually fulfill it —
  // still shown to the patient (clearly marked "not available"), just not selectable.
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  unavailableNote?: string;
}

// The lab submits its full current read of the prescription in one go — same "sync" pattern as
// LabCatalogueItem (deleteMany + createMany), not incremental add/remove calls.
export class RecommendPrescriptionTestsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecommendedTestInputDto)
  items!: RecommendedTestInputDto[];
}
