import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

// The app sends "" or null for optional fields it has no value for — both mean "not provided".
const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' || value === null ? undefined : value);

export class CreateHomeCollectionRequestDto {
  @IsString({ message: 'Patient name is required' })
  @MinLength(2, { message: 'Patient name is too short' })
  @MaxLength(80, { message: 'Patient name is too long' })
  patientName!: string;

  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit mobile number' })
  phone!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsInt({ message: 'Age must be a whole number' })
  @Min(0, { message: 'Enter a valid age' })
  @Max(120, { message: 'Enter a valid age' })
  age?: number;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Please keep the concern under 500 characters' })
  concern?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  addressId?: string;

  @IsString({ message: 'Address is required' })
  @MinLength(5, { message: 'Please enter a complete address' })
  @MaxLength(300, { message: 'Address is too long' })
  address!: string;

  @IsString({ message: 'City is required' })
  @MinLength(2, { message: 'City is required' })
  @MaxLength(60)
  city!: string;

  @Matches(/^\d{6}$/, { message: 'Pincode must be a 6-digit number' })
  pincode!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsNumber()
  lat?: number;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsNumber()
  lng?: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Preferred date must be in YYYY-MM-DD format' })
  preferredDate!: string;

  @IsIn(['MORNING', 'AFTERNOON', 'EVENING'], { message: 'Preferred time window must be MORNING, AFTERNOON or EVENING' })
  preferredWindow!: 'MORNING' | 'AFTERNOON' | 'EVENING';
}

export class CancelHomeCollectionRequestDto {
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
