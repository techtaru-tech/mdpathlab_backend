import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { absoluteImageUrl } from '../common/image-url.js';
import { CatalogueService } from './catalogue.service.js';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  // Unified list of tests + packages + radiology with full card details. All params optional:
  // type=test|package|radiology|all, category=<slug or id>, search, sort=price_asc|price_desc|name|
  // discount, page, pageSize (max 100), cityId.
  @Get('items')
  async listItems(
    @Req() req: Request,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('cityId') cityId?: string,
  ) {
    const requestBase = `${req.protocol}://${req.get('host')}`;
    const result = await this.catalogue.listItems({
      type,
      category,
      search,
      sort,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      cityId,
    });
    return { ...result, items: result.items.map((i) => ({ ...i, imageUrl: absoluteImageUrl(i.imageUrl, requestBase) })) };
  }

  @Get('categories')
  listCategories(@Query('cityId') cityId?: string) {
    return this.catalogue.listCategories(cityId);
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

  @Get('radiology')
  listRadiology(@Query('cityId') cityId?: string) {
    return this.catalogue.listRadiology(cityId);
  }

  @Get('radiology/:slug')
  getRadiology(@Param('slug') slug: string, @Query('cityId') cityId?: string) {
    return this.catalogue.getRadiology(slug, cityId);
  }

  @Get('search')
  search(@Query('q') q: string = '', @Query('cityId') cityId?: string) {
    return this.catalogue.search(q, cityId);
  }
}
