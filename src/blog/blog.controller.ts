import { Controller, Get, Param } from '@nestjs/common';
import { BlogService } from './blog.service.js';

@Controller('blog')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list() {
    return this.blog.listPublished();
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.blog.getPublished(slug);
  }
}
