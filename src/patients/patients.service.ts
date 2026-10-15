import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertFamilyMemberDto } from './dto/upsert-family-member.dto.js';
import { UpsertAddressDto } from './dto/upsert-address.dto.js';

/**
 * The website saves a date of birth and the app saves an age; every response carries both where possible — age is
 * worked out from the date of birth when only that was saved, so the apps always get a number when one is known.
 */
function withAge<T extends { dob: Date | null; age: number | null }>(m: T): T {
  if (m.age !== null || !m.dob) return m;
  const now = new Date();
  let years = now.getUTCFullYear() - m.dob.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < m.dob.getUTCMonth() || (now.getUTCMonth() === m.dob.getUTCMonth() && now.getUTCDate() < m.dob.getUTCDate());
  if (beforeBirthday) years--;
  return { ...m, age: Math.max(0, years) };
}

/** You are "Myself" already — your own details belong in your profile, not in the family list. */
function refuseSelf(relation: string | undefined) {
  if (relation?.trim().toLowerCase() === 'self') {
    throw new BadRequestException('You are already listed as "Myself". To change your own details, edit your profile.');
  }
}

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Family members ----------

  // The account holder is always shown as "Myself" by the app and the website, so a member saved with relation
  // "Self" would appear twice. Such rows stay in the database (old bookings point to them) but are not listed.
  async listFamilyMembers(userId: string) {
    const rows = await this.prisma.familyMember.findMany({
      where: { userId, NOT: { relation: { equals: 'self', mode: 'insensitive' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(withAge);
  }

  async createFamilyMember(userId: string, dto: UpsertFamilyMemberDto) {
    refuseSelf(dto.relation);
    return withAge(
      await this.prisma.familyMember.create({
        data: { ...dto, dob: dto.dob ? new Date(dto.dob) : null, userId },
      }),
    );
  }

  async updateFamilyMember(userId: string, id: string, dto: UpsertFamilyMemberDto) {
    await this.assertOwnedFamilyMember(userId, id);
    refuseSelf(dto.relation);
    // Only what is sent changes — an edit that doesn't include dob keeps the saved date of birth.
    const { dob, ...rest } = dto;
    return withAge(
      await this.prisma.familyMember.update({
        where: { id },
        data: { ...rest, ...(dob !== undefined ? { dob: dob ? new Date(dob) : null } : {}) },
      }),
    );
  }

  async deleteFamilyMember(userId: string, id: string) {
    await this.assertOwnedFamilyMember(userId, id);
    await this.prisma.familyMember.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertOwnedFamilyMember(userId: string, id: string) {
    const member = await this.prisma.familyMember.findUnique({ where: { id } });
    if (!member || member.userId !== userId) {
      throw new NotFoundException('Family member not found');
    }
    return member;
  }

  // ---------- Addresses ----------

  listAddresses(userId: string) {
    return this.prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  async createAddress(userId: string, dto: UpsertAddressDto) {
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return this.prisma.address.create({ data: { ...dto, phone: dto.phone ?? dto.receiverPhone, userId } });
  }

  async updateAddress(userId: string, id: string, dto: UpsertAddressDto) {
    await this.assertOwnedAddress(userId, id);
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return this.prisma.address.update({ where: { id }, data: { ...dto, ...(dto.phone ?? dto.receiverPhone ? { phone: dto.phone ?? dto.receiverPhone } : {}) } });
  }

  async deleteAddress(userId: string, id: string) {
    await this.assertOwnedAddress(userId, id);
    await this.prisma.address.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertOwnedAddress(userId: string, id: string) {
    const address = await this.prisma.address.findUnique({ where: { id } });
    if (!address || address.userId !== userId) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }
}
