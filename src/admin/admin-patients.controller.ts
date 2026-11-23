import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { buildPatientsWorkbook } from './patients-export.js';
import { removeAllDeviceTokens } from '../notifications/device-token-store.js';
import { IsIn, IsInt, IsString, Min, MinLength } from 'class-validator';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { CreatePatientDto, UpdatePatientDto } from './dto/create-patient.dto.js';
import { UpsertAddressDto } from '../patients/dto/upsert-address.dto.js';

const PATIENT_ROW = {
  id: true,
  phone: true,
  name: true,
  email: true,
  gender: true,
  dob: true,
  city: true,
  status: true,
  deletedAt: true,
  walletBalance: true,
  createdAt: true,
  _count: { select: { familyMembers: true, orders: true } },
  // Set when the same mobile number is also a phlebotomist (shown as a badge).
  phlebotomist: { select: { id: true, employeeCode: true } },
} as const;

// The customer deleted this account themselves: it stays as an empty record behind its old bookings, and admin
// can't bring it back, edit it or add to it.
function refuseDeleted(user: { deletedAt: Date | null } | null) {
  if (user?.deletedAt) throw new BadRequestException('The customer deleted this account — it can no longer be changed');
}

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
      // A search finds any account by number or name (a phlebotomist can be booked for too, as a customer). The
      // plain list shows customers, plus phlebotomists who have used the customer side (have a booking).
      where: search
        ? { OR: [{ phone: { contains: search } }, { name: { contains: search, mode: 'insensitive' } }] }
        : { OR: [{ role: 'PATIENT' }, { orders: { some: {} } }] },
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
    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, deletedAt: true } });
    if (!existing) throw new NotFoundException('Patient not found');
    refuseDeleted(existing);
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
      include: { familyMembers: true, addresses: { where: { deletedAt: null } }, orders: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
  }

  // A new address for the patient, e.g. while booking for them over the phone. Same fields as the patient's own.
  @Post(':id/addresses')
  async addAddress(@Param('id') id: string, @Body() dto: UpsertAddressDto) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true, deletedAt: true } });
    if (!user) throw new NotFoundException('Patient not found');
    refuseDeleted(user);
    if (dto.isDefault) await this.prisma.address.updateMany({ where: { userId: id }, data: { isDefault: false } });
    return this.prisma.address.create({ data: { ...dto, phone: dto.phone ?? dto.receiverPhone, userId: id } });
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdatePatientStatusDto) {
    refuseDeleted(await this.prisma.user.findUnique({ where: { id }, select: { deletedAt: true } }));
    const user = await this.prisma.user.update({ where: { id }, data: { status: dto.status }, select: PATIENT_ROW });
    // A blocked account must not keep getting pushes on any phone.
    if (dto.status !== 'ACTIVE') await removeAllDeviceTokens(this.prisma, id);
    return user;
  }

  /** Manual wallet credit — goodwill, referral bonus, refund-to-wallet, etc. Debits happen only via checkout. */
  @Post(':id/wallet/credit')
  async creditWallet(@Param('id') id: string, @Body() dto: CreditWalletDto) {
    refuseDeleted(await this.prisma.user.findUnique({ where: { id }, select: { deletedAt: true } }));
    await this.wallet.creditStandalone(id, dto.amount, dto.reason);
    return this.wallet.getWallet(id);
  }
}
