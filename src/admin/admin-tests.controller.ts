import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogueValidationService } from './catalogue-validation.service.js';
import { slugify } from '../common/slugify.js';
import { UpsertProfileDto } from './dto/upsert-profile.dto.js';

const CSV_COLUMNS = [
  'testCode',
  'name',
  'slug',
  'category',
  'shortDescription',
  'mrp',
  'price',
  'sampleType',
  'preparationInstructions',
  'reportTimeHours',
  'fastingRequired',
  'fastingHours',
  'sampleCollection',
  'status',
  'tag',
  'parameters',
] as const;

type CsvRow = Record<(typeof CSV_COLUMNS)[number], string>;
type RowOutcome = { row: number; action: 'CREATE' | 'UPDATE'; errors: string[]; data?: Record<string, unknown>; parameterIds?: string[] };

// "Test" is the customer-facing name for a Profile (a bundle of ProfileParameter-linked
// Parameter markers) — see prisma/schema.prisma's Profile comment. This controller is deliberately
// named admin-tests, not admin-profiles, to match the FSD terminology and the Admin nav ("Tests").
@Controller('admin/tests')
@UseGuards(AdminAuthGuard)
export class AdminTestsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CatalogueValidationService,
  ) {}

  @Get()
  async list(@Query('search') search?: string, @Query('status') status?: string, @Query('categoryId') categoryId?: string) {
    return this.prisma.profile.findMany({
      where: {
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { testCode: { contains: search, mode: 'insensitive' } }] } : {}),
        ...(status ? { status: status as never } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true, parameters: { include: { parameter: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const row = await this.prisma.profile.findUnique({ where: { id }, include: { category: true, parameters: { include: { parameter: true } } } });
    if (!row) throw new BadRequestException('Test not found');
    return row;
  }

  @Post()
  async create(@Body() dto: UpsertProfileDto) {
    this.validation.assertPricing(dto.mrp, dto.price);
    await this.validation.assertCategoryExists(dto.categoryId);
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) throw new BadRequestException('Could not derive a slug from this name — provide one explicitly');
    await this.validation.assertSlugAvailable(slug, {});

    const existingCode = await this.prisma.profile.findUnique({ where: { testCode: dto.testCode } });
    if (existingCode) throw new BadRequestException('This test code is already in use');

    await this.assertParametersExist(dto.parameterIds);

    const { parameterIds, ...fields } = dto;
    return this.prisma.profile.create({
      data: {
        ...fields,
        slug,
        parameters: parameterIds?.length ? { create: parameterIds.map((parameterId) => ({ parameterId })) } : undefined,
      },
      include: { category: true, parameters: { include: { parameter: true } } },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpsertProfileDto) {
    this.validation.assertPricing(dto.mrp, dto.price);
    await this.validation.assertCategoryExists(dto.categoryId);
    if (dto.slug) await this.validation.assertSlugAvailable(dto.slug, { excludeProfileId: id });

    const existingCode = await this.prisma.profile.findUnique({ where: { testCode: dto.testCode } });
    if (existingCode && existingCode.id !== id) throw new BadRequestException('This test code is already in use');

    await this.assertParametersExist(dto.parameterIds);

    const { parameterIds, ...fields } = dto;
    return this.prisma.profile.update({
      where: { id },
      data: {
        ...fields,
        // Historical OrderItem/CartItem snapshots reference this profile only by loose id — they
        // never re-read live Profile fields, so editing a Test never changes past bookings' prices.
        parameters: parameterIds ? { deleteMany: {}, create: parameterIds.map((parameterId) => ({ parameterId })) } : undefined,
      },
      include: { category: true, parameters: { include: { parameter: true } } },
    });
  }

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: { status: 'ACTIVE' | 'INACTIVE' }) {
    return this.prisma.profile.update({ where: { id }, data: { status: body.status } });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const [packageItems, cartItems, orderItems] = await Promise.all([
      this.prisma.packageItem.count({ where: { profileId: id } }),
      this.prisma.cartItem.count({ where: { itemType: 'PROFILE', itemId: id } }),
      this.prisma.orderItem.count({ where: { itemType: 'PROFILE', itemId: id } }),
    ]);
    if (packageItems > 0 || cartItems > 0 || orderItems > 0) {
      throw new BadRequestException(
        `Cannot delete — in use by ${packageItems} package(s), ${cartItems} active cart(s), and ${orderItems} historical order(s). Deactivate instead.`,
      );
    }
    // ProfileParameter rows cascade automatically (onDelete: Cascade) — no manual cleanup needed.
    await this.prisma.profile.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertParametersExist(parameterIds: string[] | undefined) {
    if (!parameterIds?.length) return;
    const count = await this.prisma.parameter.count({ where: { id: { in: parameterIds } } });
    if (count !== parameterIds.length) throw new BadRequestException('One or more selected parameters could not be found');
  }

  @Get('csv/template')
  downloadTemplate(@Res() res: Response) {
    const csv = stringify([CSV_COLUMNS as unknown as string[]]);
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="tests-template.csv"' });
    res.send(csv);
  }

  @Get('csv/export')
  async export(@Res() res: Response) {
    const rows = await this.prisma.profile.findMany({ include: { category: true, parameters: { include: { parameter: true } } }, orderBy: { name: 'asc' } });
    const csvRows = rows.map((r) => ({
      testCode: r.testCode,
      name: r.name,
      slug: r.slug,
      category: r.category?.name ?? '',
      shortDescription: r.shortDescription ?? '',
      mrp: r.mrp,
      price: r.price,
      sampleType: r.sampleType ?? '',
      preparationInstructions: r.preparationInstructions ?? '',
      reportTimeHours: r.reportTimeHours,
      fastingRequired: r.fastingRequired,
      fastingHours: r.fastingHours ?? '',
      sampleCollection: r.sampleCollection,
      status: r.status,
      tag: r.tag ?? '',
      parameters: r.parameters.map((pp) => pp.parameter.code || pp.parameter.name).join('|'),
    }));
    const csv = stringify(csvRows, { header: true, columns: CSV_COLUMNS as unknown as string[] });
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="tests-export.csv"' });
    res.send(csv);
  }

  @Post('csv/preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  async preview(@UploadedFile() file: Express.Multer.File) {
    return this.validateCsv(file);
  }

  @Post('csv/import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  async import(@UploadedFile() file: Express.Multer.File) {
    const { rows: outcomes } = await this.validateCsv(file);
    const validOutcomes = outcomes.filter((o) => o.errors.length === 0 && o.data);

    const result = await this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      for (const outcome of validOutcomes) {
        const data = outcome.data!;
        const parameterIds = outcome.parameterIds ?? [];
        if (outcome.action === 'CREATE') {
          await tx.profile.create({
            data: { ...data, parameters: parameterIds.length ? { create: parameterIds.map((parameterId) => ({ parameterId })) } : undefined } as never,
          });
          created += 1;
        } else {
          await tx.profile.update({
            where: { testCode: data.testCode as string },
            data: { ...data, parameters: { deleteMany: {}, create: parameterIds.map((parameterId) => ({ parameterId })) } } as never,
          });
          updated += 1;
        }
      }
      return { created, updated };
    });

    const failed = outcomes.filter((o) => o.errors.length > 0);
    return { created: result.created, updated: result.updated, failed: failed.length, rowErrors: failed.map((f) => ({ row: f.row, errors: f.errors })) };
  }

  private async validateCsv(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No CSV file uploaded');
    let rows: CsvRow[];
    try {
      rows = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
    } catch {
      throw new BadRequestException('Could not parse this file as CSV — check the format against the template');
    }

    const categories = await this.prisma.category.findMany();
    const categoriesByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
    const allParameters = await this.prisma.parameter.findMany();
    const parametersByCode = new Map(allParameters.filter((p) => p.code).map((p) => [p.code!.toLowerCase(), p]));
    const parametersByName = new Map(allParameters.map((p) => [p.name.toLowerCase(), p]));
    const existingByCode = new Map((await this.prisma.profile.findMany()).map((p) => [p.testCode, p]));
    const seenCodesInFile = new Set<string>();

    const outcomes: RowOutcome[] = rows.map((raw, index) => {
      const rowNum = index + 2;
      const errors: string[] = [];
      const testCode = raw.testCode?.trim();
      const name = raw.name?.trim();

      if (!testCode) errors.push('testCode is required');
      if (!name) errors.push('name is required');
      if (testCode) {
        if (seenCodesInFile.has(testCode)) errors.push(`duplicate testCode "${testCode}" within this CSV`);
        seenCodesInFile.add(testCode);
      }

      const mrp = Number(raw.mrp);
      const price = Number(raw.price);
      if (!Number.isFinite(mrp) || mrp < 0) errors.push('mrp must be a non-negative number');
      if (!Number.isFinite(price) || price < 0) errors.push('price must be a non-negative number');
      if (Number.isFinite(mrp) && Number.isFinite(price) && price > mrp) errors.push('Selling price cannot be greater than MRP');

      const reportTimeHours = Number(raw.reportTimeHours);
      if (!Number.isFinite(reportTimeHours) || reportTimeHours < 0) errors.push('reportTimeHours must be a non-negative number');

      const sampleCollection = (raw.sampleCollection || 'HOME').toUpperCase();
      if (!['HOME', 'LAB', 'BOTH'].includes(sampleCollection)) errors.push('sampleCollection must be HOME, LAB, or BOTH');

      const status = (raw.status || 'ACTIVE').toUpperCase();
      if (!['ACTIVE', 'INACTIVE'].includes(status)) errors.push('status must be ACTIVE or INACTIVE');

      const fastingRequired = String(raw.fastingRequired).toLowerCase() === 'true';
      const fastingHours = raw.fastingHours ? Number(raw.fastingHours) : undefined;
      if (fastingRequired && (fastingHours === undefined || !Number.isFinite(fastingHours))) {
        errors.push('fastingHours is required when fastingRequired is true');
      }

      let categoryId: string | undefined;
      if (raw.category?.trim()) {
        categoryId = categoriesByName.get(raw.category.trim().toLowerCase());
        if (!categoryId) errors.push(`category "${raw.category}" not found`);
      }

      const parameterIds: string[] = [];
      const parameterTokens = (raw.parameters || '')
        .split('|')
        .map((t) => t.trim())
        .filter(Boolean);
      for (const token of parameterTokens) {
        const match = parametersByCode.get(token.toLowerCase()) ?? parametersByName.get(token.toLowerCase());
        if (!match) errors.push(`parameter "${token}" not found — matched by code first, then name`);
        else parameterIds.push(match.id);
      }

      const existing = testCode ? existingByCode.get(testCode) : undefined;
      const action: RowOutcome['action'] = existing ? 'UPDATE' : 'CREATE';
      if (errors.length > 0) return { row: rowNum, action, errors };

      return {
        row: rowNum,
        action,
        errors: [],
        parameterIds,
        data: {
          testCode,
          name,
          slug: raw.slug?.trim() || existing?.slug || slugify(name!),
          shortDescription: raw.shortDescription?.trim() || null,
          sampleType: raw.sampleType?.trim() || null,
          preparationInstructions: raw.preparationInstructions?.trim() || null,
          mrp,
          price,
          sampleCollection,
          reportTimeHours,
          fastingRequired,
          fastingHours: fastingRequired ? fastingHours : null,
          categoryId: categoryId ?? null,
          status,
          tag: raw.tag?.trim() || null,
        },
      };
    });

    const created = outcomes.filter((o) => o.action === 'CREATE' && o.errors.length === 0).length;
    const updated = outcomes.filter((o) => o.action === 'UPDATE' && o.errors.length === 0).length;
    const invalid = outcomes.filter((o) => o.errors.length > 0).length;

    return { totalRows: rows.length, willCreate: created, willUpdate: updated, invalid, rows: outcomes };
  }
}
