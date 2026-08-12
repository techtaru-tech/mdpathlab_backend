import { Controller, Get, Param } from '@nestjs/common';
import { CatalogueService } from './catalogue.service.js';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('tests')
  listTests() {
    return this.catalogue.listTests();
  }

  @Get('tests/:slug')
  getTest(@Param('slug') slug: string) {
    return this.catalogue.getTest(slug);
  }

  @Get('packages')
  listPackages() {
    return this.catalogue.listPackages();
  }

  @Get('packages/:slug')
  getPackage(@Param('slug') slug: string) {
    return this.catalogue.getPackage(slug);
  }
}
