import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogueService } from './catalogue.service.js';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('categories')
  listCategories() {
    return this.catalogue.listCategories();
  }

  @Get('tests')
  listTests(@Query('cityId') cityId?: string) {
    return this.catalogue.listTests(cityId);
  }

  @Get('tests/:slug')
  getTest(@Param('slug') slug: string, @Query('cityId') cityId?: string) {
    return this.catalogue.getTest(slug, cityId);
  }

  @Get('packages')
  listPackages(@Query('cityId') cityId?: string) {
    return this.catalogue.listPackages(cityId);
  }

  @Get('packages/:slug')
  getPackage(@Param('slug') slug: string, @Query('cityId') cityId?: string) {
    return this.catalogue.getPackage(slug, cityId);
  }
}
