import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  listPublished() {
    return this.prisma.blogPost.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async getPublished(slug: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (!post || post.status !== 'PUBLISHED') throw new NotFoundException('Post not found');
    return post;
  }
}
