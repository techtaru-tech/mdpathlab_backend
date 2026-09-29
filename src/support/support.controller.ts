import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Public, read-only FAQ feed for the customer app's Help & Support screen — admin-managed via
// AdminFaqController. Grouped by `topic` client-side (same "one flat list, group by a field"
// convention as /catalogue/categories' tests-by-tag).
@Controller('support')
export class SupportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('faq')
  listFaq() {
    return this.prisma.faq.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ topic: 'asc' }, { sortOrder: 'asc' }],
    });
  }
}
