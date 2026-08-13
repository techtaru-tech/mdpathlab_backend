import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService) {}

  listActive() {
    return this.prisma.offer.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }
}
