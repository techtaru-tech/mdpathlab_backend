import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator';

class TestSelectionDto {
  // The PrescriptionRecommendedTest row's own id (not the underlying catalogue item's id) — this
  // list only ever contains rows the lab already put on this specific prescription.
  @IsString()
  recommendedTestId!: string;

  @IsBoolean()
  selected!: boolean;
}

export class ConfirmPrescriptionTestsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TestSelectionDto)
  selections!: TestSelectionDto[];
}
