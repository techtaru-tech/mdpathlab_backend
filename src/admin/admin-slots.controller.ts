import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Separate from the public GET /slots (which is date/scope-aware and returns only active slots
// with computed availability) — admin tooling needs the raw slot definitions, including inactive
// ones, to populate a dropdown when configuring SlotAvailability rows.
@Controller('admin/slots')
@UseGuards(AdminAuthGuard)
export class AdminSlotsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.slot.findMany({ orderBy: { sortOrder: 'asc' } });
  }
}
