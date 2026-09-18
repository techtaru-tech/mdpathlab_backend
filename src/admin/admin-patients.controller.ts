import { Body, ConflictException, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsString, Min, MinLength } from 'class-validator';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { CreatePatientDto } from './dto/create-patient.dto.js';

class UpdatePatientStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}

class CreditWalletDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}

@Controller('admin/patients')
@UseGuards(AdminAuthGuard)
export class AdminPatientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  @Get()
  async list(@Query('search') search?: string) {
    return this.prisma.user.findMany({
      where: {
        role: 'PATIENT',
        ...(search ? { OR: [{ phone: { contains: search } }, { name: { contains: search, mode: 'insensitive' } }] } : {}),
      },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        status: true,
        walletBalance: true,
        createdAt: true,
        _count: { select: { familyMembers: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Admin-created patient — no OTP flow involved, unlike self-signup via /auth/otp/verify.
   * Reason to exist: front-desk / phone-booking scenarios where an admin takes down a patient's
   * details before the patient has ever opened the app themselves.
   */
  @Post()
  async create(@Body() dto: CreatePatientDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException('A patient with this phone number already exists');

    return this.prisma.user.create({
      data: {
        phone: dto.phone,
        role: 'PATIENT',
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.email ? { email: dto.email } : {}),
        ...(dto.gender ? { gender: dto.gender } : {}),
        ...(dto.dob ? { dob: new Date(dto.dob) } : {}),
        ...(dto.city ? { city: dto.city } : {}),
      },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        status: true,
        walletBalance: true,
        createdAt: true,
        _count: { select: { familyMembers: true, orders: true } },
      },
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { familyMembers: true, addresses: true, orders: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdatePatientStatusDto) {
    return this.prisma.user.update({ where: { id }, data: { status: dto.status } });
  }

  /** Manual wallet credit — goodwill, referral bonus, refund-to-wallet, etc. Debits happen only via checkout. */
  @Post(':id/wallet/credit')
  async creditWallet(@Param('id') id: string, @Body() dto: CreditWalletDto) {
    await this.wallet.creditStandalone(id, dto.amount, dto.reason);
    return this.wallet.getWallet(id);
  }
}
