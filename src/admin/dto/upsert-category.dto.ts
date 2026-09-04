import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  // Optional — auto-derived from name on create if omitted; stays stable afterward (same
  // convention as Test/Profile slugs, see admin-tests.controller.ts).
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
