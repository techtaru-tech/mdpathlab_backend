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
import { UpsertParameterDto } from './dto/upsert-parameter.dto.js';

const CSV_COLUMNS = [
  'code',
  'name',
  'slug',
  'category',
  'shortDescription',
  'mrp',
  'price',
  'sampleCollection',
  'sampleCollectionFee',
  'reportTimeHours',
  'fastingRequired',
  'fastingHours',
  'status',
  'tag',
  'displayParameterCount',
] as const;

type CsvRow = Record<(typeof CSV_COLUMNS)[number], string>;
type RowOutcome = { row: number; action: 'CREATE' | 'UPDATE' | 'SKIP'; errors: string[]; data?: Record<string, unknown> };

@Controller('admin/parameters')
@UseGuards(AdminAuthGuard)
export class AdminParametersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CatalogueValidationService,
  ) {}

  @Get()
  async list(@Query('search') search?: string, @Query('status') status?: string, @Query('categoryId') categoryId?: string) {
    return this.prisma.parameter.findMany({
      where: {
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } : {}),
        ...(status ? { status: status as never } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const row = await this.prisma.parameter.findUnique({ where: { id }, include: { category: true } });
    if (!row) throw new BadRequestException('Parameter not found');
    return row;
  }

  @Post()
  async create(@Body() dto: UpsertParameterDto) {
    this.validation.assertPricing(dto.mrp, dto.price);
    await this.validation.assertCategoryExists(dto.categoryId);
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) throw new BadRequestException('Could not derive a slug from this name — provide one explicitly');
    await this.validation.assertSlugAvailable(slug, {});
    if (dto.code) {
      const existing = await this.prisma.parameter.findUnique({ where: { code: dto.code } });
      if (existing) throw new BadRequestException('This parameter code is already in use');
    }
    return this.prisma.parameter.create({ data: { ...dto, slug }, include: { category: true } });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpsertParameterDto) {
    this.validation.assertPricing(dto.mrp, dto.price);
    await this.validation.assertCategoryExists(dto.categoryId);
    if (dto.slug) await this.validation.assertSlugAvailable(dto.slug, { excludeParameterId: id });
    if (dto.code) {
      const existing = await this.prisma.parameter.findUnique({ where: { code: dto.code } });
      if (existing && existing.id !== id) throw new BadRequestException('This parameter code is already in use');
    }
    return this.prisma.parameter.update({ where: { id }, data: dto, include: { category: true } });
  }

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: { status: 'ACTIVE' | 'INACTIVE' }) {
    return this.prisma.parameter.update({ where: { id }, data: { status: body.status } });
  }

  // Only when genuinely unused — a Parameter can be a component of a Profile's "parameters
  // covered" (ProfileParameter), a Package's item (PackageItem), or referenced by a live cart or
  // historical order (loose id reference, no FK — see CartItem/OrderItem.itemId). Any of those
  // means deactivate instead.
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const [profileLinks, packageItems, cartItems, orderItems] = await Promise.all([
      this.prisma.profileParameter.count({ where: { parameterId: id } }),
      this.prisma.packageItem.count({ where: { parameterId: id } }),
      this.prisma.cartItem.count({ where: { itemType: 'PARAMETER', itemId: id } }),
      this.prisma.orderItem.count({ where: { itemType: 'PARAMETER', itemId: id } }),
    ]);
    if (profileLinks > 0 || packageItems > 0 || cartItems > 0 || orderItems > 0) {
      throw new BadRequestException(
        `Cannot delete — in use by ${profileLinks} test(s), ${packageItems} package(s), ${cartItems} active cart(s), and ${orderItems} historical order(s). Deactivate instead.`,
      );
    }
    await this.prisma.parameter.delete({ where: { id } });
    return { deleted: true };
  }

  @Get('csv/template')
  downloadTemplate(@Res() res: Response) {
    const csv = stringify([CSV_COLUMNS as unknown as string[]]);
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="parameters-template.csv"' });
    res.send(csv);
  }

  @Get('csv/export')
  async export(@Res() res: Response) {
    const rows = await this.prisma.parameter.findMany({ include: { category: true }, orderBy: { name: 'asc' } });
    const csvRows = rows.map((r) => ({
      code: r.code ?? '',
      name: r.name,
      slug: r.slug,
      category: r.category?.name ?? '',
      shortDescription: r.shortDescription ?? '',
      mrp: r.mrp,
      price: r.price,
      sampleCollection: r.sampleCollection,
      sampleCollectionFee: r.sampleCollectionFee,
      reportTimeHours: r.reportTimeHours,
      fastingRequired: r.fastingRequired,
      fastingHours: r.fastingHours ?? '',
      status: r.status,
      tag: r.tag ?? '',
      displayParameterCount: r.displayParameterCount ?? '',
    }));
    const csv = stringify(csvRows, { header: true, columns: CSV_COLUMNS as unknown as string[] });
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="parameters-export.csv"' });
    res.send(csv);
  }

  // Validation-only preview — never writes to the database. The admin reviews this output and
  // calls POST /admin/parameters/csv/import with confirm:true to actually commit.
  @Post('csv/preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  async preview(@UploadedFile() file: Express.Multer.File) {
    return this.validateCsv(file);
  }

  @Post('csv/import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  async import(@UploadedFile() file: Express.Multer.File) {
    const { rows: outcomes, categoriesByName } = await this.validateCsv(file);
    const validOutcomes = outcomes.filter((o) => o.errors.length === 0 && o.data);

    // One transaction for the whole batch — either the entire valid set commits, or none of it
    // does, so a failure partway through never leaves a half-imported, inconsistent CSV batch.
    const result = await this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      for (const outcome of validOutcomes) {
        const data = outcome.data!;
        if (outcome.action === 'CREATE') {
          await tx.parameter.create({ data: data as never });
          created += 1;
        } else {
          await tx.parameter.update({ where: { code: data.code as string }, data: data as never });
          updated += 1;
        }
      }
      return { created, updated };
    });

    const failed = outcomes.filter((o) => o.errors.length > 0);
    return { created: result.created, updated: result.updated, failed: failed.length, rowErrors: failed.map((f) => ({ row: f.row, errors: f.errors })), categoriesByName };
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
    const existingByCode = new Map((await this.prisma.parameter.findMany({ where: { code: { not: null } } })).map((p) => [p.code!, p]));
    const seenCodesInFile = new Set<string>();

    const outcomes: RowOutcome[] = rows.map((raw, index) => {
      const rowNum = index + 2; // header is row 1
      const errors: string[] = [];
      const name = raw.name?.trim();
      const code = raw.code?.trim() || undefined;

      if (!name) errors.push('name is required');
      if (code) {
        if (seenCodesInFile.has(code)) errors.push(`duplicate code "${code}" within this CSV`);
        seenCodesInFile.add(code);
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

      const sampleCollectionFee = raw.sampleCollectionFee?.trim() ? Number(raw.sampleCollectionFee) : 0;
      if (!Number.isFinite(sampleCollectionFee) || sampleCollectionFee < 0) errors.push('sampleCollectionFee must be a non-negative number');

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

      const existing = code ? existingByCode.get(code) : undefined;
      const action: RowOutcome['action'] = existing ? 'UPDATE' : 'CREATE';
      if (errors.length > 0) return { row: rowNum, action, errors };

      return {
        row: rowNum,
        action,
        errors: [],
        data: {
          name,
          code,
          slug: raw.slug?.trim() || existing?.slug || slugify(name),
          shortDescription: raw.shortDescription?.trim() || null,
          mrp,
          price,
          sampleCollection,
          sampleCollectionFee,
          reportTimeHours,
          fastingRequired,
          fastingHours: fastingRequired ? fastingHours : null,
          categoryId: categoryId ?? null,
          status,
          tag: raw.tag?.trim() || null,
          displayParameterCount: raw.displayParameterCount ? Number(raw.displayParameterCount) : null,
        },
      };
    });

    const created = outcomes.filter((o) => o.action === 'CREATE' && o.errors.length === 0).length;
    const updated = outcomes.filter((o) => o.action === 'UPDATE' && o.errors.length === 0).length;
    const invalid = outcomes.filter((o) => o.errors.length > 0).length;

    return {
      totalRows: rows.length,
      willCreate: created,
      willUpdate: updated,
      invalid,
      rows: outcomes,
      categoriesByName: Object.fromEntries(categoriesByName),
    };
  }
}
