import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { discardUpload, IMAGE_OR_DOCUMENT_EXTENSIONS, resolveUploadType } from '../common/upload-safety.js';
import { partnerDocumentStorage } from '../partners/partner-documents.js';
import { MAX_PARTNER_DOCUMENT_BYTES, PARTNER_DOCUMENTS_URL_PREFIX } from '../partners/partner-document-kinds.js';
import { PartnerMouService } from './partner-mou.service.js';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AdminPermissionGuard, RequireAdminPermission } from '../partners/admin/admin-permission.guard.js';
import type { AdminActor } from '../partners/admin/admin-audit.js';
import { PartnerAuthGuard, type PartnerTokenPayload } from '../partners/partner-auth.guard.js';
import { PartnersEnabledGuard } from '../partners/partners-feature.js';
import { PayoutsService } from './payouts.service.js';
import { CommissionSweeper } from './commission.sweeper.js';
import {
  AcceptMouDto,
  AdjustmentDto,
  CreateMouDto,
  MarkPaidDto,
  ReportQueryDto,
  SetCategoriesDto,
  StatementQueryDto,
  RatesQueryDto,
  RequestWithdrawalDto,
  SaveBankAccountDto,
  SetRatesDto,
  UpdateCommissionSettingsDto,
  WithdrawalDecisionDto,
  WithdrawalListQueryDto,
} from './dto/payouts.dto.js';

type PartnerRequest = { partner: PartnerTokenPayload };

const pdfFile = (f: { buffer: Buffer; filename: string }) =>
  new StreamableFile(f.buffer, { type: 'application/pdf', disposition: `attachment; filename="${f.filename}"` });

// One signed-copy upload (PDF or photo) into the protected partner-documents folder; the caller saves its URL.
const signedCopyUpload = () =>
  UseInterceptors(FileInterceptor('file', { storage: partnerDocumentStorage, limits: { fileSize: MAX_PARTNER_DOCUMENT_BYTES, files: 1, fields: 2, fieldSize: 256 } }));

async function savedSignedCopy(file: Express.Multer.File | undefined, save: (f: { fileUrl: string; mimeType: string }) => Promise<unknown>) {
  if (!file) throw new BadRequestException('Please choose the signed MOU file');
  const real = await resolveUploadType(file, IMAGE_OR_DOCUMENT_EXTENSIONS);
  if (!real) throw new BadRequestException('File must be a PDF or a JPEG, PNG, WebP or HEIC image');
  try {
    return await save({ fileUrl: `${PARTNER_DOCUMENTS_URL_PREFIX}${real.filename}`, mimeType: real.mimetype });
  } catch (err) {
    await discardUpload(real.path);
    throw err;
  }
}
type AdminRequest = { admin: AdminActor };

/** The partner's own earnings, bank account and withdrawals. Only ever their own — the id comes from the token. */
@Controller('partner/earnings')
@UseGuards(PartnersEnabledGuard, PartnerAuthGuard)
export class PartnerEarningsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly mous: PartnerMouService,
  ) {}

  @Get()
  get(@Req() req: PartnerRequest) {
    return this.payouts.partnerEarnings(req.partner.sub);
  }

  // The partner's MOUs: the one in force, the one waiting for their signature, history.
  @Get('mous')
  myMous(@Req() req: PartnerRequest) {
    return this.mous.partnerMous(req.partner.sub);
  }

  // Download the MOU (PDF) to sign.
  @Get('mous/:mouId/document')
  async myMouPdf(@Req() req: PartnerRequest, @Param('mouId') mouId: string) {
    return pdfFile(await this.mous.documentPdf(req.partner.sub, mouId));
  }

  // Accept the MOU online: OTP to the partner's registered mobile, then the code.
  @Post('mous/:mouId/accept/otp')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  acceptOtp(@Req() req: PartnerRequest, @Param('mouId') mouId: string) {
    return this.mous.sendAcceptOtp(req.partner.sub, mouId);
  }

  @Post('mous/:mouId/accept')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  accept(@Req() req: PartnerRequest & { ip?: string }, @Param('mouId') mouId: string, @Body() dto: AcceptMouDto) {
    return this.mous.acceptWithOtp(req.partner.sub, mouId, dto.otp, req.ip ?? null);
  }

  // Upload the signed MOU (PDF or photo); admin then verifies it.
  @Post('mous/:mouId/signed')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @signedCopyUpload()
  uploadSigned(@Req() req: PartnerRequest, @Param('mouId') mouId: string, @UploadedFile() file?: Express.Multer.File) {
    return savedSignedCopy(file, (f) => this.mous.partnerUploadSigned(req.partner.sub, mouId, f));
  }

  // Monthly statement (IST month) — the partner's own ledger only.
  @Get('statement')
  statement(@Req() req: PartnerRequest, @Query() query: StatementQueryDto) {
    return this.mous.statement(req.partner.sub, query.month);
  }

  @Put('bank-account')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  saveBank(@Req() req: PartnerRequest, @Body() dto: SaveBankAccountDto) {
    return this.payouts.saveBankAccount(req.partner.sub, dto);
  }

  @Post('withdrawals')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  withdraw(@Req() req: PartnerRequest, @Body() dto: RequestWithdrawalDto) {
    return this.payouts.requestWithdrawal(req.partner.sub, dto.amountRupees);
  }

  @Post('withdrawals/:id/cancel')
  cancel(@Req() req: PartnerRequest, @Param('id') id: string) {
    return this.payouts.cancelWithdrawal(req.partner.sub, id);
  }
}

// Commission settings, withdrawal requests and partner balances. Every change needs PAYOUTS_MANAGE and is audited.
@Controller('admin/payouts')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminPayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly sweeper: CommissionSweeper,
    private readonly mous: PartnerMouService,
  ) {}

  @Get('settings')
  @RequireAdminPermission('PAYOUTS_VIEW')
  settings() {
    return this.payouts.adminSettings();
  }

  @Put('settings')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  updateSettings(@Req() req: AdminRequest, @Body() dto: UpdateCommissionSettingsDto) {
    return this.payouts.adminUpdateSettings(dto, req.admin);
  }

  // MD Path Lab's signature + stamp (PNG or JPEG — printed on every MOU). Stored privately with partner documents.
  @Post('settings/signature')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  @signedCopyUpload()
  async uploadSignature(@Req() req: AdminRequest, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Please choose the signature image');
    const real = await resolveUploadType(file, { 'image/png': '.png', 'image/jpeg': '.jpg' });
    if (!real) throw new BadRequestException('The signature must be a PNG or JPEG image');
    try {
      return await this.payouts.setMouSignature(`${PARTNER_DOCUMENTS_URL_PREFIX}${real.filename}`, req.admin);
    } catch (err) {
      await discardUpload(real.path);
      throw err;
    }
  }

  @Delete('settings/signature')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  removeSignature(@Req() req: AdminRequest) {
    return this.payouts.setMouSignature(null, req.admin);
  }

  @Get('health')
  @RequireAdminPermission('PAYOUTS_VIEW')
  health() {
    return this.sweeper.health();
  }

  // Runs the commission job now instead of waiting for its next 5-minute tick. Idempotent, like every run.
  @Post('run-now')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  runNow() {
    return this.sweeper.runOnce();
  }

  @Get('withdrawals')
  @RequireAdminPermission('PAYOUTS_VIEW')
  withdrawals(@Query() query: WithdrawalListQueryDto) {
    return this.payouts.adminWithdrawals(query.status, query.page ?? 1);
  }

  // Shows the full account number, so it needs the manage permission and is audited.
  @Get('withdrawals/:id')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  withdrawal(@Req() req: AdminRequest, @Param('id') id: string) {
    return this.payouts.adminWithdrawal(id, req.admin);
  }

  @Post('withdrawals/:id/approve')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  approve(@Req() req: AdminRequest, @Param('id') id: string) {
    return this.payouts.approve(id, req.admin);
  }

  @Post('withdrawals/:id/reject')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  reject(@Req() req: AdminRequest, @Param('id') id: string, @Body() dto: WithdrawalDecisionDto) {
    return this.payouts.reject(id, dto.reason, req.admin);
  }

  @Post('withdrawals/:id/paid')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  paid(@Req() req: AdminRequest, @Param('id') id: string, @Body() dto: MarkPaidDto) {
    return this.payouts.markPaid(id, dto.utr, req.admin);
  }

  @Get('rates')
  @RequireAdminPermission('PAYOUTS_VIEW')
  rates(@Query() query: RatesQueryDto) {
    return this.payouts.adminRates(query.type, query.q, query.page ?? 1);
  }

  @Put('rates')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  setRates(@Req() req: AdminRequest, @Body() dto: SetRatesDto) {
    return this.payouts.adminSetRates(dto, req.admin);
  }

  // Tests marked Special ({ "PROFILE:id": "SPECIAL" }) — for the category dropdown in the catalogue forms.
  @Get('categories')
  @RequireAdminPermission('PAYOUTS_VIEW')
  specialItems() {
    return this.mous.specialItems();
  }

  // Routine / Special per test (packages are always Package).
  @Put('categories')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  setCategories(@Req() req: AdminRequest, @Body() dto: SetCategoriesDto) {
    return this.mous.setCategories(dto, req.admin);
  }

  // Signed MOUs uploaded and waiting for admin to verify (shown on Admin → Doctors & Clinics).
  @Get('mous/to-verify')
  @RequireAdminPermission('PAYOUTS_VIEW')
  mousToVerify() {
    return this.mous.toVerify();
  }

  // Partner-wise, date-wise commission report.
  @Get('report')
  @RequireAdminPermission('PAYOUTS_VIEW')
  report(@Query() query: ReportQueryDto) {
    return this.mous.report(query.from, query.to);
  }

  @Get('partners/:partnerId/mous')
  @RequireAdminPermission('PAYOUTS_VIEW')
  listMous(@Param('partnerId') partnerId: string) {
    return this.mous.list(partnerId);
  }

  @Post('partners/:partnerId/mous')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  createMou(@Req() req: AdminRequest, @Param('partnerId') partnerId: string, @Body() dto: CreateMouDto) {
    return this.mous.create(partnerId, dto, req.admin);
  }

  // Only an MOU that hasn't started yet.
  @Delete('partners/:partnerId/mous/:mouId')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  withdrawMou(@Req() req: AdminRequest, @Param('partnerId') partnerId: string, @Param('mouId') mouId: string) {
    return this.mous.withdraw(partnerId, mouId, req.admin);
  }

  // A signed copy received on paper / by email (PDF or image). Stored with the partner documents — served only
  // through signed links. It still needs Verify.
  @Post('partners/:partnerId/mous/:mouId/document')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  @signedCopyUpload()
  uploadMouDocument(@Req() req: AdminRequest, @Param('partnerId') partnerId: string, @Param('mouId') mouId: string, @UploadedFile() file?: Express.Multer.File) {
    return savedSignedCopy(file, (f) => this.mous.attachDocument(partnerId, mouId, f, req.admin));
  }

  // The generated MOU (PDF), as the partner gets it.
  @Get('partners/:partnerId/mous/:mouId/pdf')
  @RequireAdminPermission('PAYOUTS_VIEW')
  async mouPdf(@Param('partnerId') partnerId: string, @Param('mouId') mouId: string) {
    return pdfFile(await this.mous.documentPdf(partnerId, mouId));
  }

  // The signed copy checks out — the rates now apply.
  @Post('partners/:partnerId/mous/:mouId/verify')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  verifyMou(@Req() req: AdminRequest, @Param('partnerId') partnerId: string, @Param('mouId') mouId: string) {
    return this.mous.verify(partnerId, mouId, req.admin);
  }

  // Send the signed copy back with a reason; the partner uploads again.
  @Post('partners/:partnerId/mous/:mouId/reject')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  rejectMou(@Req() req: AdminRequest, @Param('partnerId') partnerId: string, @Param('mouId') mouId: string, @Body() dto: WithdrawalDecisionDto) {
    return this.mous.reject(partnerId, mouId, dto.reason, req.admin);
  }

  @Get('partners/:partnerId/statement')
  @RequireAdminPermission('PAYOUTS_VIEW')
  partnerStatement(@Param('partnerId') partnerId: string, @Query() query: StatementQueryDto) {
    return this.mous.statement(partnerId, query.month);
  }

  @Get('balances')
  @RequireAdminPermission('PAYOUTS_VIEW')
  balances() {
    return this.payouts.adminBalances();
  }

  @Get('partners/:partnerId')
  @RequireAdminPermission('PAYOUTS_VIEW')
  ledger(@Param('partnerId') partnerId: string) {
    return this.payouts.adminPartnerLedger(partnerId);
  }

  @Post('partners/:partnerId/adjust')
  @RequireAdminPermission('PAYOUTS_MANAGE')
  adjust(@Req() req: AdminRequest, @Param('partnerId') partnerId: string, @Body() dto: AdjustmentDto) {
    return this.payouts.adminAdjust(partnerId, dto, req.admin);
  }
}
