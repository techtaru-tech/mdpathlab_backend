import { Type } from 'class-transformer';
import { CreateHomeCollectionRequestDto } from '../../home-visits/dto/create-home-collection-request.dto.js';
import { HOME_VISIT_SOURCES, type HomeVisitSource } from '../../home-visits/home-visits.service.js';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

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

// POST /admin/home-collection-requests — a home visit admin enters for an enquiry by phone, WhatsApp or walk-in.
// Same fields and rules as the customer's own request, for one of the patient accounts (pick or create it first).
export class AdminCreateHomeVisitDto extends CreateHomeCollectionRequestDto {
  @IsString()
  userId!: string;

  @IsIn(HOME_VISIT_SOURCES)
  source!: HomeVisitSource;
}

// PATCH /admin/home-collection-requests/:id — only what is sent changes; allowed until the phlebotomist sets off.
export class AdminUpdateHomeVisitDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  patientName?: string;

  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit mobile number' })
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  concern?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Pincode must be a 6-digit number' })
  pincode?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Preferred date must be in YYYY-MM-DD format' })
  preferredDate?: string;

  @IsOptional()
  @IsIn(['MORNING', 'AFTERNOON', 'EVENING'])
  preferredWindow?: 'MORNING' | 'AFTERNOON' | 'EVENING';

  @IsOptional()
  @IsIn(HOME_VISIT_SOURCES)
  source?: HomeVisitSource;
}
