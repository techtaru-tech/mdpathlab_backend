import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PARTNER_DOCUMENT_LABELS } from './partner-document-kinds.js';
import { hasMandatoryDocument, sortRequirements, type DocumentRequirement } from './partner-requirements.js';
import { cleanText } from './partner-normalize.js';
import { writeAdminAudit, type AdminActor } from './admin/admin-audit.js';
import type { CreateClinicTypeDto, ReplaceRequirementsDto, UpdateClinicTypeDto } from './dto/partner-admin.dto.js';

export const withLabels = (requirements: DocumentRequirement[]) =>
  requirements.map((r) => ({ ...r, label: PARTNER_DOCUMENT_LABELS[r.documentKind] }));

/**
 * Which documents a doctor, or a clinic of a given type, must or may upload — admin-configurable per clinic type,
 * because a single-doctor clinic and a hospital are not registered the same way.
 */
@Injectable()
export class PartnerRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  async forScope(partnerType: 'DOCTOR' | 'CLINIC', clinicTypeCode: string | null): Promise<DocumentRequirement[]> {
    if (partnerType === 'CLINIC' && !clinicTypeCode) return [];
    const rows = await this.prisma.partnerDocumentRequirement.findMany({
      where: { partnerType, clinicTypeCode: partnerType === 'DOCTOR' ? null : clinicTypeCode },
      select: { documentKind: true, level: true },
    });
    return sortRequirements(rows);
  }

  /** Clinic types a new applicant may choose: active and asking for at least one mandatory document. */
  async selectableClinicTypes() {
    const types = await this.prisma.clinicType.findMany({
      where: { isActive: true, requirements: { some: { level: 'MANDATORY' } } },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { code: true, label: true, registrationNumberRequired: true, registrationNumberLabel: true },
    });
    return types;
  }

  /** The clinic type an application is being saved or submitted with — refused if it is not open for registration. */
  async requireSelectableClinicType(code: string) {
    const type = await this.prisma.clinicType.findUnique({
      where: { code },
      include: { requirements: { where: { level: 'MANDATORY' }, select: { id: true }, take: 1 } },
    });
    if (!type || !type.isActive || type.requirements.length === 0) {
      throw new BadRequestException('This clinic type is not open for registration — please choose another or contact us');
    }
    return type;
  }

  // ---------------------------------------------------------------- admin settings

  listClinicTypesForAdmin() {
    return this.prisma.clinicType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      include: { _count: { select: { clinics: true } }, requirements: { select: { documentKind: true, level: true } } },
    });
  }

  async createClinicType(dto: CreateClinicTypeDto, admin: AdminActor) {
    // Created inactive: it cannot be offered to applicants until its document requirements are set and it is
    // switched on (which checks that at least one document is mandatory).
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.clinicType.create({
          data: {
            code: dto.code,
            label: cleanText(dto.label)!,
            registrationNumberRequired: dto.registrationNumberRequired ?? false,
            registrationNumberLabel: cleanText(dto.registrationNumberLabel),
            sortOrder: dto.sortOrder ?? 0,
            isActive: false,
          },
        });
        await writeAdminAudit(tx, admin, { action: 'CLINIC_TYPE_CREATE', entityType: 'ClinicType', entityId: created.code, after: created });
        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A clinic type with this code already exists');
      }
      throw err;
    }
  }

  async updateClinicType(code: string, dto: UpdateClinicTypeDto, admin: AdminActor) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.clinicType.findUnique({ where: { code } });
      if (!before) throw new NotFoundException('Clinic type not found');
      if (dto.isActive === true && !before.isActive) {
        const mandatory = await tx.partnerDocumentRequirement.count({ where: { clinicTypeCode: code, level: 'MANDATORY' } });
        if (mandatory === 0) throw new BadRequestException('Set at least one mandatory document before switching this clinic type on');
      }
      const updated = await tx.clinicType.update({
        where: { code },
        data: {
          ...(dto.label !== undefined ? { label: cleanText(dto.label)! } : {}),
          ...(dto.registrationNumberRequired !== undefined ? { registrationNumberRequired: dto.registrationNumberRequired } : {}),
          ...(dto.registrationNumberLabel !== undefined ? { registrationNumberLabel: cleanText(dto.registrationNumberLabel) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
      await writeAdminAudit(tx, admin, { action: 'CLINIC_TYPE_UPDATE', entityType: 'ClinicType', entityId: code, before, after: updated });
      return updated;
    });
  }

  async requirementsForAdmin(partnerType: 'DOCTOR' | 'CLINIC', clinicTypeCode?: string) {
    if (partnerType === 'CLINIC' && !clinicTypeCode) throw new BadRequestException('clinicTypeCode is required for clinic requirements');
    return withLabels(await this.forScope(partnerType, partnerType === 'CLINIC' ? clinicTypeCode! : null));
  }

  /**
   * Replaces the whole requirement set for one scope (doctors, or one clinic type). Applications already submitted
   * keep the set they were checked against (ReferralPartner.submittedRequirements); drafts see the new one.
   */
  async replaceRequirements(dto: ReplaceRequirementsDto, admin: AdminActor) {
    const clinicTypeCode = dto.partnerType === 'CLINIC' ? dto.clinicTypeCode : null;
    if (dto.partnerType === 'CLINIC' && !clinicTypeCode) throw new BadRequestException('clinicTypeCode is required for clinic requirements');
    const kinds = dto.items.map((i) => i.documentKind);
    if (new Set(kinds).size !== kinds.length) throw new BadRequestException('Each document can appear only once');

    return this.prisma.$transaction(async (tx) => {
      let mustHaveMandatory = dto.partnerType === 'DOCTOR';
      if (clinicTypeCode) {
        const type = await tx.clinicType.findUnique({ where: { code: clinicTypeCode } });
        if (!type) throw new NotFoundException('Clinic type not found');
        mustHaveMandatory = type.isActive;
      }
      if (mustHaveMandatory && !hasMandatoryDocument(dto.items)) {
        throw new BadRequestException(
          dto.partnerType === 'DOCTOR'
            ? 'Doctors must be asked for at least one mandatory document'
            : 'An active clinic type needs at least one mandatory document — switch it off first to clear them',
        );
      }

      const scope = { partnerType: dto.partnerType, clinicTypeCode };
      const before = await tx.partnerDocumentRequirement.findMany({ where: scope, select: { documentKind: true, level: true } });
      await tx.partnerDocumentRequirement.deleteMany({ where: scope });
      if (dto.items.length > 0) {
        await tx.partnerDocumentRequirement.createMany({
          data: dto.items.map((i) => ({ ...scope, documentKind: i.documentKind, level: i.level, updatedBy: admin.email })),
        });
      }
      await writeAdminAudit(tx, admin, {
        action: 'PARTNER_REQUIREMENTS_REPLACE',
        entityType: 'PartnerDocumentRequirement',
        entityId: clinicTypeCode ?? 'DOCTOR',
        reason: cleanText(dto.reason),
        before: sortRequirements(before),
        after: sortRequirements(dto.items),
      });
      return withLabels(sortRequirements(dto.items));
    });
  }
}
