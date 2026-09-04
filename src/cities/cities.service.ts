import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  listActive() {
    return this.prisma.city.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }
}
