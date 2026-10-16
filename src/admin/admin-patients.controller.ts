import { Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { buildPatientsWorkbook } from './patients-export.js';
import { removeAllDeviceTokens } from '../notifications/device-token-store.js';
import { IsIn, IsInt, IsString, Min, MinLength } from 'class-validator';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { CreatePatientDto, UpdatePatientDto } from './dto/create-patient.dto.js';

const PATIENT_ROW = {
  id: true,
  phone: true,
  name: true,
  email: true,
  gender: true,
  dob: true,
  city: true,
  status: true,
  walletBalance: true,
  createdAt: true,
  _count: { select: { familyMembers: true, orders: true } },
} as const;

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
      select: PATIENT_ROW,
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
      select: PATIENT_ROW,
    });
  }

  // Excel (.xlsx) of every patient with their bookings, payments and wallet.
  @Get('export')
  async export(@Res() res: Response) {
    const buffer = await buildPatientsWorkbook(this.prisma);
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="patients-${day}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!existing || existing.role !== 'PATIENT') throw new NotFoundException('Patient not found');
    if (dto.phone !== undefined) {
      const taken = await this.prisma.user.findUnique({ where: { phone: dto.phone }, select: { id: true } });
      if (taken && taken.id !== id) throw new ConflictException('This mobile number is already registered to another account');
    }
    const text = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.name !== undefined ? { name: text(dto.name) } : {}),
        ...(dto.email !== undefined ? { email: text(dto.email) } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.dob !== undefined ? { dob: dto.dob ? new Date(dto.dob) : null } : {}),
        ...(dto.city !== undefined ? { city: text(dto.city) } : {}),
      },
      select: PATIENT_ROW,
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
  async updateStatus(@Param('id') id: string, @Body() dto: UpdatePatientStatusDto) {
    const user = await this.prisma.user.update({ where: { id }, data: { status: dto.status }, select: PATIENT_ROW });
    // A blocked account must not keep getting pushes on any phone.
    if (dto.status !== 'ACTIVE') await removeAllDeviceTokens(this.prisma, id);
    return user;
  }

  /** Manual wallet credit — goodwill, referral bonus, refund-to-wallet, etc. Debits happen only via checkout. */
  @Post(':id/wallet/credit')
  async creditWallet(@Param('id') id: string, @Body() dto: CreditWalletDto) {
    await this.wallet.creditStandalone(id, dto.amount, dto.reason);
    return this.wallet.getWallet(id);
  }
}
