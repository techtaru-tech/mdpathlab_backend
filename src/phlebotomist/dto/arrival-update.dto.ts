import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// POST /phlebotomist/orders/:id/on-the-way and /eta: minutes until the phlebotomist expects to reach the patient.
export class ArrivalEtaDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  etaMinutes?: number;
}

// POST /phlebotomist/orders/:id/delay: "running late". delayMinutes (optional) moves the expected arrival by that much.
export class RunningLateDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  delayMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
