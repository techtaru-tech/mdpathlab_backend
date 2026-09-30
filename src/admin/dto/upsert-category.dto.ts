import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertCategoryDto {
  // Absolute URL, or a path under /uploads. Shown on the customer app's Home screen.
  @IsOptional()
  @IsString()
  imageUrl?: string;

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

  // "Why {category} checkups matter" bullets for the header mega-menu — one per line.
  @IsOptional()
  @IsString()
  description?: string;
}
