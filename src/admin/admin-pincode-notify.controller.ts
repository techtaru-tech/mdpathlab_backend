import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Read-only — status flips PENDING -> NOTIFIED automatically once a Lab is added/edited to
// cover that pincode (see PincodeNotifyService.notifyPendingForPincode), so there's no manual
// "mark as done" action here, unlike ContactQuery/CallbackRequest.
@Controller('admin/pincode-notify-requests')
@UseGuards(AdminAuthGuard)
export class AdminPincodeNotifyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.pincodeNotifyRequest.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
