import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PartnerOtpService } from './partner-otp.service.js';
import { PartnerRequirementsService, withLabels } from './partner-requirements.service.js';
import { PartnerEmails } from './partner-emails.js';
import { MAX_ACTIVE_PARTNER_DOCUMENTS, MAX_TOTAL_PARTNER_DOCUMENTS, PARTNER_DOCUMENT_LABELS, type PartnerDocumentKind } from './partner-document-kinds.js';
import { hasMandatoryDocument, isDocumentKindAllowed, missingMandatoryDocuments, type DocumentRequirement } from './partner-requirements.js';
import { PARTNER_TRANSITIONS, canTransition, isApplicationEditable, type PartnerAction, type PartnerStatus } from './partner-status.js';
import { cleanText, normalizeAuthority, normalizeEmail, normalizeGstin, normalizeRegistrationNumber } from './partner-normalize.js';
import { writeAdminAudit, type AdminActor } from './admin/admin-audit.js';
import type { PartnerTokenPayload } from './partner-auth.guard.js';
import type { ClinicApplicationDto, DoctorApplicationDto } from './dto/partner-application.dto.js';
import type { VerifyPartnerOtpDto } from './dto/partner-auth.dto.js';
import type { ListPartnersQueryDto } from './dto/partner-admin.dto.js';

type PartnerType = 'DOCTOR' | 'CLINIC';
type Tx = Prisma.TransactionClient;

// Same answer whichever field matched, so the form cannot be used to find out who else is registered.
export const DUPLICATE_REGISTRATION_MESSAGE = 'These registration details are already registered. Please sign in with that account or contact us.';

const EDITABLE: PartnerStatus[] = ['DRAFT', 'REJECTED'];

const PARTNER_DETAIL_INCLUDE = {
  doctorProfile: true,
  clinicProfile: { include: { clinicType: { select: { code: true, label: true, registrationNumberRequired: true, registrationNumberLabel: true } } } },
  documents: { orderBy: { uploadedAt: 'desc' } },
  events: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.ReferralPartnerInclude;

type PartnerDetail = Prisma.ReferralPartnerGetPayload<{ include: typeof PARTNER_DETAIL_INCLUDE }>;

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly otp: PartnerOtpService,
    private readonly requirements: PartnerRequirementsService,
    private readonly emails: PartnerEmails,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- login

  async login(dto: VerifyPartnerOtpDto) {
    // The OTP is verified FIRST: checking "does this account exist / were the terms accepted" before it would let
    // anyone learn, without a valid code, whether a mobile number belongs to a registered doctor or clinic.
    await this.otp.verify(dto.phone, dto.code);
    const existing = await this.prisma.referralPartner.findUnique({ where: { type_phone: { type: dto.type, phone: dto.phone } } });
    if (!existing && dto.termsAccepted !== true) {
      throw new BadRequestException('Please accept the Terms & Conditions and Privacy Policy, then request a new OTP');
    }

    let partner = existing;
    if (!partner) {
      try {
        partner = await this.prisma.$transaction(async (tx) => {
          const created = await tx.referralPartner.create({ data: { type: dto.type, phone: dto.phone, phoneVerifiedAt: new Date() } });
          await tx.referralPartnerEvent.create({
            data: { partnerId: created.id, event: 'ACCOUNT_CREATED', toStatus: 'DRAFT', actorType: 'PARTNER', actorId: created.id },
          });
          return created;
        });
      } catch (err) {
        // A parallel verify created it a moment ago — that account is the one to sign in to.
        if (!isUniqueViolation(err)) throw err;
        partner = await this.prisma.referralPartner.findUniqueOrThrow({ where: { type_phone: { type: dto.type, phone: dto.phone } } });
      }
    }

    const payload: PartnerTokenPayload = { sub: partner.id, type: 'partner', partnerType: partner.type, phone: partner.phone };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, partner: { id: partner.id, type: partner.type, phone: partner.phone, status: partner.status, displayName: partner.displayName } };
  }

  // ---------------------------------------------------------------- the partner's own view

  async me(partnerId: string) {
    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId }, include: PARTNER_DETAIL_INCLUDE });
    if (!partner) throw new NotFoundException('Account not found');
    return this.toPartnerView(partner);
  }

  private async requirementsFor(partner: { type: PartnerType; clinicProfile: { clinicTypeCode: string } | null }) {
    return this.requirements.forScope(partner.type, partner.type === 'CLINIC' ? (partner.clinicProfile?.clinicTypeCode ?? null) : null);
  }

  private async toPartnerView(p: PartnerDetail) {
    const requirements = await this.requirementsFor(p);
    const activeDocuments = p.documents.filter((d) => !d.removedAt);
    // The partner sees the outcome of the last decision (with its reason), never which admin made it.
    const lastDecision = p.events.find((e) => e.toStatus === 'APPROVED' || e.toStatus === 'REJECTED' || e.toStatus === 'SUSPENDED') ?? null;
    return {
      id: p.id,
      type: p.type,
      phone: p.phone,
      email: p.email,
      displayName: p.displayName,
      status: p.status,
      editable: isApplicationEditable(p.status),
      submittedAt: p.submittedAt,
      decidedAt: p.decidedAt,
      declarationAcceptedAt: p.declarationAcceptedAt,
      lastDecision: lastDecision ? { status: lastDecision.toStatus, reason: lastDecision.reason, at: lastDecision.createdAt } : null,
      doctorProfile: p.doctorProfile,
      clinicProfile: p.clinicProfile,
      documents: activeDocuments.map((d) => ({
        id: d.id,
        kind: d.kind,
        label: PARTNER_DOCUMENT_LABELS[d.kind],
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        uploadedAt: d.uploadedAt,
      })),
      requirements: withLabels(requirements),
      missingDocuments: missingMandatoryDocuments(requirements, p.documents),
      maxDocuments: MAX_ACTIVE_PARTNER_DOCUMENTS,
    };
  }

  async requirementsPreview(partnerId: string, clinicTypeCode?: string) {
    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId }, include: { clinicProfile: { select: { clinicTypeCode: true } } } });
    if (!partner) throw new NotFoundException('Account not found');
    if (partner.type === 'DOCTOR') return withLabels(await this.requirements.forScope('DOCTOR', null));
    const code = clinicTypeCode ?? partner.clinicProfile?.clinicTypeCode;
    if (!code) return [];
    await this.requirements.requireSelectableClinicType(code);
    return withLabels(await this.requirements.forScope('CLINIC', code));
  }

  // ---------------------------------------------------------------- application editing

  /**
   * Inside a transaction: proves the application is still editable AND row-locks it, so a save or upload cannot
   * slip in after a concurrent submit (the submit's own conditional update waits on the same row).
   */
  private async lockEditable(tx: Tx, partnerId: string, type: PartnerType | null, data: Prisma.ReferralPartnerUpdateManyMutationInput = {}) {
    const touched = await tx.referralPartner.updateMany({
      where: { id: partnerId, status: { in: EDITABLE }, ...(type ? { type } : {}) },
      data: { ...data, updatedAt: new Date() },
    });
    if (touched.count === 1) return;
    const partner = await tx.referralPartner.findUnique({ where: { id: partnerId }, select: { type: true, status: true } });
    if (!partner) throw new NotFoundException('Account not found');
    if (type && partner.type !== type) throw new BadRequestException(`This is a ${partner.type === 'DOCTOR' ? 'doctor' : 'clinic'} account`);
    throw new BadRequestException('Your application has been submitted and can no longer be changed');
  }

  async saveDoctorApplication(partnerId: string, dto: DoctorApplicationDto) {
    const profile = {
      fullName: cleanText(dto.fullName)!,
      medicalCouncil: normalizeAuthority(dto.medicalCouncil)!,
      registrationNumber: normalizeRegistrationNumber(dto.registrationNumber)!,
      registrationYear: dto.registrationYear ?? null,
      qualification: cleanText(dto.qualification)!,
      specialization: cleanText(dto.specialization),
      city: cleanText(dto.city)!,
      pincode: dto.pincode,
    };
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockEditable(tx, partnerId, 'DOCTOR', { displayName: profile.fullName, email: normalizeEmail(dto.email) });
        await tx.doctorProfile.upsert({ where: { partnerId }, create: { partnerId, ...profile }, update: profile });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(DUPLICATE_REGISTRATION_MESSAGE);
      throw err;
    }
    return this.me(partnerId);
  }

  async saveClinicApplication(partnerId: string, dto: ClinicApplicationDto) {
    const type = await this.requirements.requireSelectableClinicType(dto.clinicTypeCode);
    const registrationNumber = normalizeRegistrationNumber(dto.registrationNumber);
    if (type.registrationNumberRequired && !registrationNumber) {
      throw new BadRequestException(`${type.registrationNumberLabel ?? 'Registration number'} is required for a ${type.label.toLowerCase()}`);
    }
    const profile = {
      clinicName: cleanText(dto.clinicName)!,
      clinicTypeCode: type.code,
      // '' (not NULL) when a number is given without an authority: NULLs never collide in a unique index, so two
      // clinics entering the same number and no authority would otherwise both get through the duplicate check.
      registrationAuthority: normalizeAuthority(dto.registrationAuthority) ?? (registrationNumber ? '' : null),
      registrationNumber,
      gstin: normalizeGstin(dto.gstin),
      address: cleanText(dto.address)!,
      city: cleanText(dto.city)!,
      state: cleanText(dto.state),
      pincode: dto.pincode,
      contactPersonName: cleanText(dto.contactPersonName)!,
      contactPersonDesignation: cleanText(dto.contactPersonDesignation),
    };
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockEditable(tx, partnerId, 'CLINIC', { displayName: profile.clinicName, email: normalizeEmail(dto.email) });
        await tx.clinicProfile.upsert({ where: { partnerId }, create: { partnerId, ...profile }, update: profile });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(DUPLICATE_REGISTRATION_MESSAGE);
      throw err;
    }
    return this.me(partnerId);
  }

  /** The caller has already verified the file's real type; on any refusal here it must delete the file. */
  async addDocument(partnerId: string, kind: PartnerDocumentKind, file: { fileUrl: string; mimeType: string; sizeBytes: number }) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, partnerId, null);
      const partner = await tx.referralPartner.findUniqueOrThrow({ where: { id: partnerId }, include: { clinicProfile: { select: { clinicTypeCode: true } } } });
      if (partner.type === 'CLINIC' && !partner.clinicProfile) {
        throw new BadRequestException('Save your clinic details first, so we know which documents to ask for');
      }
      const requirements = await this.requirementsFor(partner);
      if (!isDocumentKindAllowed(requirements, kind)) {
        throw new BadRequestException(`${PARTNER_DOCUMENT_LABELS[kind]} is not needed for this application`);
      }
      const active = await tx.referralPartnerDocument.count({ where: { partnerId, removedAt: null } });
      if (active >= MAX_ACTIVE_PARTNER_DOCUMENTS) {
        throw new BadRequestException(`You can upload up to ${MAX_ACTIVE_PARTNER_DOCUMENTS} documents — remove one first`);
      }
      const total = await tx.referralPartnerDocument.count({ where: { partnerId } });
      if (total >= MAX_TOTAL_PARTNER_DOCUMENTS) {
        throw new BadRequestException('Upload limit reached for this application — please contact us');
      }
      await tx.referralPartnerDocument.create({ data: { partnerId, kind, ...file } });
    });
    return this.me(partnerId);
  }

  /** Soft removal: the row (and file) stay for the record, but no longer count towards the application. */
  async removeDocument(partnerId: string, documentId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, partnerId, null);
      const removed = await tx.referralPartnerDocument.updateMany({
        where: { id: documentId, partnerId, removedAt: null },
        data: { removedAt: new Date() },
      });
      if (removed.count !== 1) throw new NotFoundException('Document not found');
    });
    return this.me(partnerId);
  }

  async submit(partnerId: string) {
    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId }, include: PARTNER_DETAIL_INCLUDE });
    if (!partner) throw new NotFoundException('Account not found');
    if (!canTransition(partner.status, 'SUBMIT')) {
      throw new BadRequestException('Your application has already been submitted');
    }
    if (partner.type === 'DOCTOR' && !partner.doctorProfile) throw new BadRequestException('Please fill in your professional details first');
    if (partner.type === 'CLINIC') {
      if (!partner.clinicProfile) throw new BadRequestException('Please fill in your clinic details first');
      await this.requirements.requireSelectableClinicType(partner.clinicProfile.clinicTypeCode);
    }

    const requirements: DocumentRequirement[] = await this.requirementsFor(partner);
    if (!hasMandatoryDocument(requirements)) {
      throw new BadRequestException('Registration is not open for this application type right now — please contact us');
    }
    const missing = missingMandatoryDocuments(requirements, partner.documents);
    if (missing.length > 0) throw new BadRequestException(`Please upload: ${missing.join(', ')}`);

    const now = new Date();
    const transition = PARTNER_TRANSITIONS.SUBMIT;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.referralPartner.updateMany({
        where: { id: partnerId, status: partner.status },
        data: {
          status: transition.to,
          submittedAt: now,
          declarationAcceptedAt: now,
          submittedRequirements: requirements as unknown as Prisma.InputJsonValue,
        },
      });
      if (claimed.count !== 1) throw new ConflictException('Your application was just updated — please refresh');
      // Re-checked under the row lock the update above holds: a document removed after the first check
      // (removal needs the same lock) is seen here, and the whole submit rolls back.
      const current = await tx.referralPartnerDocument.findMany({ where: { partnerId, removedAt: null }, select: { kind: true, removedAt: true } });
      const stillMissing = missingMandatoryDocuments(requirements, current);
      if (stillMissing.length > 0) throw new BadRequestException(`Please upload: ${stillMissing.join(', ')}`);
      await tx.referralPartnerEvent.create({
        data: { partnerId, event: transition.event, fromStatus: partner.status, toStatus: transition.to, actorType: 'PARTNER', actorId: partnerId },
      });
    });

    const kind = partner.type === 'DOCTOR' ? 'Doctor' : 'Clinic';
    await this.notifications.notifyAdmins({
      title: `New ${kind.toLowerCase()} application`,
      body: `${partner.displayName ?? kind} submitted a partner application for review`,
      data: { type: 'PARTNER_APPLICATION', partnerId },
    });
    this.emails.submitted(partner);
    return this.me(partnerId);
  }

  // ---------------------------------------------------------------- admin

  async adminList(query: ListPartnersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q = cleanText(query.q);
    const where: Prisma.ReferralPartnerWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { email: { contains: q, mode: 'insensitive' } },
              { doctorProfile: { registrationNumber: { contains: normalizeRegistrationNumber(q)! } } },
              { clinicProfile: { registrationNumber: { contains: normalizeRegistrationNumber(q)! } } },
              { doctorProfile: { city: { contains: q, mode: 'insensitive' } } },
              { clinicProfile: { city: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.referralPartner.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          type: true,
          status: true,
          displayName: true,
          phone: true,
          email: true,
          submittedAt: true,
          decidedAt: true,
          createdAt: true,
          doctorProfile: { select: { city: true, specialization: true, medicalCouncil: true, registrationNumber: true } },
          clinicProfile: { select: { city: true, clinicType: { select: { label: true } } } },
        },
      }),
      this.prisma.referralPartner.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async adminSummary() {
    const rows = await this.prisma.referralPartner.groupBy({ by: ['type', 'status'], _count: { _all: true } });
    return rows.map((r) => ({ type: r.type, status: r.status, count: r._count._all }));
  }

  async adminDetail(partnerId: string) {
    const partner = await this.prisma.referralPartner.findUnique({
      where: { id: partnerId },
      include: {
        ...PARTNER_DETAIL_INCLUDE,
        doctorProfile: { include: { affiliations: { include: { clinic: { select: { partnerId: true, clinicName: true, city: true } } }, orderBy: { createdAt: 'desc' } } } },
        clinicProfile: {
          include: {
            clinicType: { select: { code: true, label: true, registrationNumberRequired: true, registrationNumberLabel: true } },
            affiliations: { include: { doctor: { select: { partnerId: true, fullName: true, city: true } } }, orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });
    if (!partner) throw new NotFoundException('Partner not found');
    const requirements = await this.requirementsFor(partner);
    return {
      ...partner,
      documents: partner.documents.map((d) => ({ ...d, label: PARTNER_DOCUMENT_LABELS[d.kind] })),
      requirements: withLabels(requirements),
      missingDocuments: missingMandatoryDocuments(requirements, partner.documents),
      possibleDuplicates: await this.possibleDuplicates(partner),
    };
  }

  /**
   * For the reviewer: other accounts sharing this one's registration number (whatever council/authority was typed —
   * those are free text, so "RMC" and "Rajasthan Medical Council" never collide in the unique index) or its mobile
   * number. Read-only; nothing is blocked automatically.
   */
  private async possibleDuplicates(partner: {
    id: string;
    phone: string;
    doctorProfile: { registrationNumber: string } | null;
    clinicProfile: { registrationNumber: string | null } | null;
  }) {
    const doctorReg = partner.doctorProfile?.registrationNumber ?? null;
    const clinicReg = partner.clinicProfile?.registrationNumber ?? null;
    const rows = await this.prisma.referralPartner.findMany({
      where: {
        id: { not: partner.id },
        OR: [
          { phone: partner.phone },
          ...(doctorReg ? [{ doctorProfile: { registrationNumber: doctorReg } }] : []),
          ...(clinicReg ? [{ clinicProfile: { registrationNumber: clinicReg } }] : []),
        ],
      },
      take: 20,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        status: true,
        displayName: true,
        phone: true,
        doctorProfile: { select: { medicalCouncil: true, registrationNumber: true } },
        clinicProfile: { select: { registrationAuthority: true, registrationNumber: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      displayName: r.displayName,
      matchedOn: [
        ...(r.phone === partner.phone ? ['mobile number'] : []),
        ...((doctorReg && r.doctorProfile?.registrationNumber === doctorReg) || (clinicReg && r.clinicProfile?.registrationNumber === clinicReg)
          ? ['registration number']
          : []),
      ],
      registration: r.doctorProfile
        ? `${r.doctorProfile.medicalCouncil} · ${r.doctorProfile.registrationNumber}`
        : r.clinicProfile?.registrationNumber
          ? `${r.clinicProfile.registrationAuthority || '—'} · ${r.clinicProfile.registrationNumber}`
          : null,
    }));
  }

  async adminDecide(partnerId: string, action: Exclude<PartnerAction, 'SUBMIT'>, rawReason: string | undefined, admin: AdminActor) {
    const transition = PARTNER_TRANSITIONS[action];
    const reason = cleanText(rawReason);
    if (transition.needsReason && (!reason || reason.length < 3)) throw new BadRequestException('Please give a reason');

    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException('Partner not found');
    if (!canTransition(partner.status, action)) {
      throw new BadRequestException(`This ${partner.type === 'DOCTOR' ? 'doctor' : 'clinic'} is ${partner.status.toLowerCase()} — that action is not possible`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Conditional on the status just read: of two admins deciding at once, exactly one wins.
      const claimed = await tx.referralPartner.updateMany({
        where: { id: partnerId, status: partner.status },
        data: { status: transition.to, decidedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('Someone else just updated this application — refresh and try again');
      await tx.referralPartnerEvent.create({
        data: {
          partnerId,
          event: transition.event,
          fromStatus: partner.status,
          toStatus: transition.to,
          reason,
          actorType: 'ADMIN',
          actorId: admin.sub,
          actorLabel: admin.email,
        },
      });
      await writeAdminAudit(tx, admin, {
        action: `PARTNER_${action}`,
        entityType: 'ReferralPartner',
        entityId: partnerId,
        reason,
        before: { status: partner.status },
        after: { status: transition.to },
      });
    });

    if (action === 'APPROVE') this.emails.approved(partner);
    else if (action === 'REJECT') this.emails.rejected(partner, reason!);
    else if (action === 'SUSPEND') this.emails.suspended(partner, reason!);
    else this.emails.reactivated(partner);
    return this.adminDetail(partnerId);
  }
}
