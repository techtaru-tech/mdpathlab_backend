import { IsInt, IsString, Min, MinLength } from 'class-validator';

// One row of a catalogue item's "city-wise pricing" — reused by the Test/Package/Parameter
// upsert DTOs. Absence of a city here (vs. the full City list) means that city just uses the
// item's own flat mrp/price — this is only for cities that need an override.
export class CityPriceDto {
  @IsString()
  @MinLength(1)
  cityId!: string;

  @IsInt()
  @Min(0)
  mrp!: number;

  @IsInt()
  @Min(0)
  price!: number;
}
