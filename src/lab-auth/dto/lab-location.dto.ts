import { IsLatitude, IsLongitude, ValidateIf } from 'class-validator';

// PATCH /lab/auth/me/location — the lab's own map pin. Both null removes it.
export class LabLocationDto {
  @ValidateIf((o: LabLocationDto) => o.lat !== null || o.lng !== null)
  @IsLatitude()
  lat!: number | null;

  @ValidateIf((o: LabLocationDto) => o.lat !== null || o.lng !== null)
  @IsLongitude()
  lng!: number | null;
}
