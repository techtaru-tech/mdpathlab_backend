import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PincodeNotifyService } from '../pincode-notify/pincode-notify.service.js';
import { CreateLabDto, SetLabCatalogueDto, UpdateLabDto } from './dto/upsert-lab.dto.js';

@Controller('admin/labs')
@UseGuards(AdminAuthGuard)
export class AdminLabsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pincodeNotify: PincodeNotifyService,
  ) {}

  @Get()
  async list() {
    const labs = await this.prisma.lab.findMany({
      include: { catalogueItems: true, phlebotomists: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return labs.map(({ passwordHash: _passwordHash, ...lab }) => lab);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const lab = await this.prisma.lab.findUnique({
      where: { id },
      include: { catalogueItems: true, phlebotomists: { include: { user: { select: { name: true, phone: true } } } } },
    });
    if (!lab) throw new NotFoundException('Lab not found');
    const { passwordHash: _passwordHash, ...rest } = lab;
    return rest;
  }

  @Post()
  async create(@Body() dto: CreateLabDto) {
    const existing = await this.prisma.lab.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('A lab with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const lab = await this.prisma.lab.create({
      data: {
        name: dto.name,
        ownerName: dto.ownerName,
        email: dto.email,
        passwordHash,
        phone: dto.phone,
        servicePincodes: dto.servicePincodes ?? [],
        address: dto.address,
        accreditationNumber: dto.accreditationNumber,
        pathologistName: dto.pathologistName,
        pathologistQualification: dto.pathologistQualification,
      },
    });

    for (const pincode of dto.servicePincodes ?? []) {
      await this.pincodeNotify.notifyPendingForPincode(pincode);
    }

    const { passwordHash: _passwordHash, ...rest } = lab;
    return rest;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLabDto) {
    const existing = await this.prisma.lab.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lab not found');

    const data: Record<string, unknown> = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.servicePincodes !== undefined ? { servicePincodes: dto.servicePincodes } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.accreditationNumber !== undefined ? { accreditationNumber: dto.accreditationNumber } : {}),
      ...(dto.pathologistName !== undefined ? { pathologistName: dto.pathologistName } : {}),
      ...(dto.pathologistQualification !== undefined ? { pathologistQualification: dto.pathologistQualification } : {}),
    };
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);

    const lab = await this.prisma.lab.update({ where: { id }, data });

    // Newly-added pincodes may have pending "notify me" requests waiting on exactly this —
    // best-effort, never blocks the response (see PincodeNotifyService.notifyPendingForPincode).
    const newlyAdded = (dto.servicePincodes ?? []).filter((p) => !existing.servicePincodes.includes(p));
    for (const pincode of newlyAdded) {
      await this.pincodeNotify.notifyPendingForPincode(pincode);
    }

    const { passwordHash: _passwordHash, ...rest } = lab;
    return rest;
  }

  // "Sync" write, same deleteMany+create pattern as CityPrice/ProfileParameter — the admin picks
  // the full current set of items this lab offers, not incremental add/remove calls.
  @Patch(':id/catalogue')
  async setCatalogue(@Param('id') id: string, @Body() dto: SetLabCatalogueDto) {
    const existing = await this.prisma.lab.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lab not found');

    await this.prisma.$transaction([
      this.prisma.labCatalogueItem.deleteMany({ where: { labId: id } }),
      ...(dto.items.length
        ? [
            this.prisma.labCatalogueItem.createMany({
              data: dto.items.map((item) => ({ labId: id, itemType: item.itemType, itemId: item.itemId })),
            }),
          ]
        : []),
    ]);

    return this.prisma.labCatalogueItem.findMany({ where: { labId: id } });
  }
}
