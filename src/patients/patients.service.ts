import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertFamilyMemberDto } from './dto/upsert-family-member.dto.js';
import { UpsertAddressDto } from './dto/upsert-address.dto.js';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Family members ----------

  listFamilyMembers(userId: string) {
    return this.prisma.familyMember.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  createFamilyMember(userId: string, dto: UpsertFamilyMemberDto) {
    return this.prisma.familyMember.create({
      data: { ...dto, dob: dto.dob ? new Date(dto.dob) : null, userId },
    });
  }

  async updateFamilyMember(userId: string, id: string, dto: UpsertFamilyMemberDto) {
    await this.assertOwnedFamilyMember(userId, id);
    return this.prisma.familyMember.update({
      where: { id },
      data: { ...dto, dob: dto.dob ? new Date(dto.dob) : null },
    });
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
    return this.prisma.address.create({ data: { ...dto, userId } });
  }

  async updateAddress(userId: string, id: string, dto: UpsertAddressDto) {
    await this.assertOwnedAddress(userId, id);
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return this.prisma.address.update({ where: { id }, data: dto });
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
