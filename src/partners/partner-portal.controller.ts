import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { discardUpload, IMAGE_OR_DOCUMENT_EXTENSIONS, resolveUploadType } from '../common/upload-safety.js';
import { PartnersEnabledGuard } from './partners-feature.js';
import { PartnerAuthGuard, type PartnerTokenPayload } from './partner-auth.guard.js';
import { PartnersService } from './partners.service.js';
import { PartnerRequirementsService } from './partner-requirements.service.js';
import { PartnerAffiliationsService } from './partner-affiliations.service.js';
import { partnerDocumentStorage } from './partner-documents.js';
import { isPartnerDocumentKind, MAX_PARTNER_DOCUMENT_BYTES, PARTNER_DOCUMENTS_URL_PREFIX } from './partner-document-kinds.js';
import {
  AffiliationNoteDto,
  ClinicApplicationDto,
  DoctorApplicationDto,
  RequestAffiliationDto,
  RequirementsQueryDto,
  SearchClinicsQueryDto,
  SubmitPartnerApplicationDto,
} from './dto/partner-application.dto.js';

type PartnerRequest = { partner: PartnerTokenPayload };

/**
 * The doctor/clinic portal. Every route acts only on the partner in the token — no route takes another partner's
 * id to read or change. 404 while doctor registration is switched off.
 */
@Controller('partner')
@UseGuards(PartnersEnabledGuard, PartnerAuthGuard)
export class PartnerPortalController {
  constructor(
    private readonly partners: PartnersService,
    private readonly requirements: PartnerRequirementsService,
    private readonly affiliations: PartnerAffiliationsService,
  ) {}

  @Get('me')
  me(@Req() req: PartnerRequest) {
    return this.partners.me(req.partner.sub);
  }

  @Get('clinic-types')
  clinicTypes() {
    return this.requirements.selectableClinicTypes();
  }

  @Get('requirements')
  requirementsPreview(@Req() req: PartnerRequest, @Query() query: RequirementsQueryDto) {
    return this.partners.requirementsPreview(req.partner.sub, query.clinicTypeCode);
  }

  @Put('application/doctor')
  saveDoctor(@Req() req: PartnerRequest, @Body() dto: DoctorApplicationDto) {
    return this.partners.saveDoctorApplication(req.partner.sub, dto);
  }

  @Put('application/clinic')
  saveClinic(@Req() req: PartnerRequest, @Body() dto: ClinicApplicationDto) {
    return this.partners.saveClinicApplication(req.partner.sub, dto);
  }

  @Post('application/documents')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  // One file and a handful of small text fields per request — anything bigger is refused by multer itself.
  @UseInterceptors(
    FileInterceptor('file', { storage: partnerDocumentStorage, limits: { fileSize: MAX_PARTNER_DOCUMENT_BYTES, files: 1, fields: 5, fieldSize: 1024 } }),
  )
  async uploadDocument(@Req() req: PartnerRequest, @Body('kind') kind: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Please choose a file to upload');
    // multer has already saved the file before any validation runs, so `kind` is checked here (not by a DTO pipe)
    // to make sure a refused upload is always deleted.
    if (!isPartnerDocumentKind(kind)) {
      await discardUpload(file.path);
      throw new BadRequestException('Please choose which document this is');
    }
    // The type comes from the file's own bytes, never the client's claim; anything else is deleted and refused.
    const real = await resolveUploadType(file, IMAGE_OR_DOCUMENT_EXTENSIONS);
    if (!real) throw new BadRequestException('File must be a PDF or a JPEG, PNG, WebP or HEIC image');
    try {
      return await this.partners.addDocument(req.partner.sub, kind, {
        fileUrl: `${PARTNER_DOCUMENTS_URL_PREFIX}${real.filename}`,
        mimeType: real.mimetype,
        sizeBytes: file.size,
      });
    } catch (err) {
      // Refused (not editable, kind not needed, too many files...) — the file must not stay on disk.
      await discardUpload(real.path);
      throw err;
    }
  }

  @Delete('application/documents/:id')
  removeDocument(@Req() req: PartnerRequest, @Param('id') id: string) {
    return this.partners.removeDocument(req.partner.sub, id);
  }

  // The declaration checkbox is validated by the DTO (must be true); the service records when it was accepted.
  @Post('application/submit')
  submit(@Req() req: PartnerRequest, @Body() _dto: SubmitPartnerApplicationDto) {
    return this.partners.submit(req.partner.sub);
  }

  @Get('clinics')
  searchClinics(@Req() req: PartnerRequest, @Query() query: SearchClinicsQueryDto) {
    if (req.partner.partnerType !== 'DOCTOR') throw new ForbiddenException('Only doctors can search for clinics');
    return this.affiliations.searchClinics(req.partner.sub, query.q, query.city);
  }

  @Get('affiliations')
  listAffiliations(@Req() req: PartnerRequest) {
    return this.affiliations.listForPartner(req.partner.sub, req.partner.partnerType);
  }

  @Post('affiliations')
  requestAffiliation(@Req() req: PartnerRequest, @Body() dto: RequestAffiliationDto) {
    if (req.partner.partnerType !== 'DOCTOR') throw new ForbiddenException('Only doctors can ask to join a clinic');
    return this.affiliations.request(req.partner.sub, dto.clinicPartnerId);
  }

  @Post('affiliations/:id/accept')
  acceptAffiliation(@Req() req: PartnerRequest, @Param('id') id: string, @Body() dto: AffiliationNoteDto) {
    if (req.partner.partnerType !== 'CLINIC') throw new ForbiddenException('Only the clinic can accept a request');
    return this.affiliations.respond(req.partner.sub, id, true, dto.note);
  }

  @Post('affiliations/:id/reject')
  rejectAffiliation(@Req() req: PartnerRequest, @Param('id') id: string, @Body() dto: AffiliationNoteDto) {
    if (req.partner.partnerType !== 'CLINIC') throw new ForbiddenException('Only the clinic can reject a request');
    return this.affiliations.respond(req.partner.sub, id, false, dto.note);
  }

  @Post('affiliations/:id/end')
  endAffiliation(@Req() req: PartnerRequest, @Param('id') id: string, @Body() dto: AffiliationNoteDto) {
    return this.affiliations.end(req.partner.sub, req.partner.partnerType, id, dto.note);
  }
}
