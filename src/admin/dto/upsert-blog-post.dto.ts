import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertBlogPostDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  @MinLength(1)
  category!: string;

  @IsString()
  @MinLength(1)
  excerpt!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  // Arrives as a string over multipart/form-data — parsed to Int in the controller.
  @IsOptional()
  @IsString()
  readTimeMinutes?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED';
}

// Every field optional — PATCH is a genuine partial update, and the cover image itself is
// optional since an admin editing just the title/content shouldn't be forced to re-upload it.
export class UpdateBlogPostDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  readTimeMinutes?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED';
}
