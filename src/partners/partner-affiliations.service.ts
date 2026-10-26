import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PartnerEmails } from './partner-emails.js';
import { cleanText } from './partner-normalize.js';
import { writeAdminAudit, type AdminActor } from './admin/admin-audit.js';

type AffiliationStatus = 'REQUESTED' | 'ACTIVE' | 'REJECTED' | 'ENDED';
type Actor = { type: 'PARTNER'; partnerId: string } | { type: 'ADMIN'; admin: AdminActor };

const OPEN: AffiliationStatus[] = ['REQUESTED', 'ACTIVE'];
// Per doctor, rolling 24 hours (admin-created affiliations don't count).
const MAX_REQUESTS_PER_CLINIC_PER_DAY = 2;
const MAX_REQUESTS_PER_DAY = 10;

/**
 * A doctor practising at a clinic: the doctor asks, the clinic accepts or rejects, either side (or an admin) can
 * end it. Informational only in this phase — an affiliation never changes who a referral belongs to.
 */
@Injectable()
export class PartnerAffiliationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: PartnerEmails,
  ) {}

  private async requireApproved(id: string, type: 'DOCTOR' | 'CLINIC', notFound: string) {
    const partner = await this.prisma.referralPartner.findUnique({ where: { id } });
    if (!partner || partner.type !== type || partner.status !== 'APPROVED') throw new BadRequestException(notFound);
    return partner;
  }

  /** One event on each side's history, so both the doctor's and the clinic's timelines show the change. */
  private async recordOnBoth(
    tx: Prisma.TransactionClient,
    aff: { id: string; doctorPartnerId: string; clinicPartnerId: string },
    event: string,
    actor: Actor,
    reason: string | null,
  ) {
    const who =
      actor.type === 'ADMIN'
        ? { actorType: 'ADMIN' as const, actorId: actor.admin.sub, actorLabel: actor.admin.email }
        : { actorType: 'PARTNER' as const, actorId: actor.partnerId };
    await tx.referralPartnerEvent.createMany({
      data: [aff.doctorPartnerId, aff.clinicPartnerId].map((partnerId) => ({ partnerId, event, affiliationId: aff.id, reason, ...who })),
    });
  }

  // ---------------------------------------------------------------- partner side

  async listForPartner(partnerId: string, type: 'DOCTOR' | 'CLINIC') {
    if (type === 'DOCTOR') {
      const rows = await this.prisma.doctorClinicAffiliation.findMany({
        where: { doctorPartnerId: partnerId },
        orderBy: { createdAt: 'desc' },
        include: { clinic: { select: { partnerId: true, clinicName: true, city: true, clinicType: { select: { label: true } } } } },
      });
      return rows.map((r) => ({ id: r.id, status: r.status, note: r.note, createdAt: r.createdAt, decidedAt: r.decidedAt, endedAt: r.endedAt, counterpart: { id: r.clinic.partnerId, name: r.clinic.clinicName, city: r.clinic.city, detail: r.clinic.clinicType.label } }));
    }
    // A clinic sees the doctor's professional details only — never their mobile number or email.
    const rows = await this.prisma.doctorClinicAffiliation.findMany({
      where: { clinicPartnerId: partnerId },
      orderBy: { createdAt: 'desc' },
      include: { doctor: { select: { partnerId: true, fullName: true, city: true, qualification: true, specialization: true } } },
    });
    return rows.map((r) => ({ id: r.id, status: r.status, note: r.note, createdAt: r.createdAt, decidedAt: r.decidedAt, endedAt: r.endedAt, counterpart: { id: r.doctor.partnerId, name: r.doctor.fullName, city: r.doctor.city, detail: [r.doctor.qualification, r.doctor.specialization].filter(Boolean).join(' · ') } }));
  }

  /** Approved clinics an approved doctor can ask to join — name, city and type only. */
  async searchClinics(doctorId: string, rawQuery?: string, rawCity?: string) {
    await this.requireApproved(doctorId, 'DOCTOR', 'Only an approved doctor can search for clinics');
    const q = cleanText(rawQuery);
    if (!q || q.length < 2) return [];
    const city = cleanText(rawCity);
    const rows = await this.prisma.referralPartner.findMany({
      where: {
        type: 'CLINIC',
        status: 'APPROVED',
        clinicProfile: { clinicName: { contains: q, mode: 'insensitive' }, ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}) },
      },
      take: 20,
      orderBy: { displayName: 'asc' },
      select: { id: true, clinicProfile: { select: { clinicName: true, city: true, clinicType: { select: { label: true } } } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.clinicProfile!.clinicName, city: r.clinicProfile!.city, type: r.clinicProfile!.clinicType.label }));
  }

  async request(doctorId: string, clinicPartnerId: string) {
    const doctor = await this.requireApproved(doctorId, 'DOCTOR', 'Only an approved doctor can ask to join a clinic');
    const clinic = await this.requireApproved(clinicPartnerId, 'CLINIC', 'Clinic not found');
    // Every request emails the clinic, so request → withdraw → request again must not become a way to spam it.
    const since = new Date(Date.now() - 24 * 3600_000);
    const [toThisClinic, toAnyClinic] = await Promise.all([
      this.prisma.doctorClinicAffiliation.count({ where: { doctorPartnerId: doctor.id, clinicPartnerId: clinic.id, createdAt: { gte: since } } }),
      this.prisma.doctorClinicAffiliation.count({ where: { doctorPartnerId: doctor.id, createdAt: { gte: since } } }),
    ]);
    if (toThisClinic >= MAX_REQUESTS_PER_CLINIC_PER_DAY) {
      throw new HttpException('You have already asked this clinic twice today — please try again tomorrow', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (toAnyClinic >= MAX_REQUESTS_PER_DAY) {
      throw new HttpException('You have sent the most clinic requests allowed for today — please try again tomorrow', HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const aff = await tx.doctorClinicAffiliation.create({ data: { doctorPartnerId: doctor.id, clinicPartnerId: clinic.id } });
        await this.recordOnBoth(tx, aff, 'AFFILIATION_REQUESTED', { type: 'PARTNER', partnerId: doctor.id }, null);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('You already have an open request or affiliation with this clinic');
      }
      throw err;
    }
    this.emails.affiliationUpdated(clinic, `${doctor.displayName ?? 'A doctor'} has asked to be listed as practising at your clinic. Accept or reject it in the partner portal.`);
    return this.listForPartner(doctor.id, 'DOCTOR');
  }

  /** The clinic accepts or rejects a pending request addressed to it. */
  async respond(clinicId: string, affiliationId: string, accept: boolean, rawNote?: string) {
    await this.requireApproved(clinicId, 'CLINIC', 'Only an approved clinic can respond to requests');
    const aff = await this.prisma.doctorClinicAffiliation.findFirst({ where: { id: affiliationId, clinicPartnerId: clinicId } });
    if (!aff) throw new NotFoundException('Request not found');
    if (accept) await this.requireApproved(aff.doctorPartnerId, 'DOCTOR', 'This doctor is not currently approved');
    const note = cleanText(rawNote);
    await this.changeStatus(aff, ['REQUESTED'], accept ? 'ACTIVE' : 'REJECTED', accept ? 'AFFILIATION_ACCEPTED' : 'AFFILIATION_REJECTED', { type: 'PARTNER', partnerId: clinicId }, note);
    const doctor = await this.prisma.referralPartner.findUnique({ where: { id: aff.doctorPartnerId } });
    const clinic = await this.prisma.referralPartner.findUnique({ where: { id: clinicId } });
    if (doctor) this.emails.affiliationUpdated(doctor, `${clinic?.displayName ?? 'The clinic'} has ${accept ? 'accepted' : 'declined'} your request to be listed as practising there.`);
    return this.listForPartner(clinicId, 'CLINIC');
  }

  /** Either side withdraws a pending request or ends an active affiliation. */
  async end(partnerId: string, type: 'DOCTOR' | 'CLINIC', affiliationId: string, rawNote?: string) {
    const aff = await this.prisma.doctorClinicAffiliation.findFirst({
      where: { id: affiliationId, ...(type === 'DOCTOR' ? { doctorPartnerId: partnerId } : { clinicPartnerId: partnerId }) },
    });
    if (!aff) throw new NotFoundException('Affiliation not found');
    await this.changeStatus(aff, OPEN, 'ENDED', 'AFFILIATION_ENDED', { type: 'PARTNER', partnerId }, cleanText(rawNote));
    const otherId = type === 'DOCTOR' ? aff.clinicPartnerId : aff.doctorPartnerId;
    const [me, other] = await Promise.all([
      this.prisma.referralPartner.findUnique({ where: { id: partnerId } }),
      this.prisma.referralPartner.findUnique({ where: { id: otherId } }),
    ]);
    if (other) this.emails.affiliationUpdated(other, `${me?.displayName ?? 'The other side'} has ended the affiliation between your accounts.`);
    return this.listForPartner(partnerId, type);
  }

  // ---------------------------------------------------------------- admin side

  async adminCreate(doctorPartnerId: string, clinicPartnerId: string, rawReason: string, admin: AdminActor) {
    await this.requireApproved(doctorPartnerId, 'DOCTOR', 'The doctor must be an approved doctor account');
    await this.requireApproved(clinicPartnerId, 'CLINIC', 'The clinic must be an approved clinic account');
    const reason = cleanText(rawReason);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const aff = await tx.doctorClinicAffiliation.create({ data: { doctorPartnerId, clinicPartnerId, status: 'ACTIVE', decidedAt: new Date() } });
        await this.recordOnBoth(tx, aff, 'AFFILIATION_CREATED_BY_ADMIN', { type: 'ADMIN', admin }, reason);
        await writeAdminAudit(tx, admin, { action: 'AFFILIATION_CREATE', entityType: 'DoctorClinicAffiliation', entityId: aff.id, reason, after: { status: 'ACTIVE', doctorPartnerId, clinicPartnerId } });
        return aff;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('These two accounts already have an open request or affiliation');
      }
      throw err;
    }
  }

  async adminDecide(affiliationId: string, action: 'APPROVE' | 'REJECT' | 'END', rawReason: string, admin: AdminActor) {
    const aff = await this.prisma.doctorClinicAffiliation.findUnique({ where: { id: affiliationId } });
    if (!aff) throw new NotFoundException('Affiliation not found');
    const reason = cleanText(rawReason);
    const [from, to, event]: [AffiliationStatus[], AffiliationStatus, string] =
      action === 'APPROVE'
        ? [['REQUESTED'], 'ACTIVE', 'AFFILIATION_ACCEPTED']
        : action === 'REJECT'
          ? [['REQUESTED'], 'REJECTED', 'AFFILIATION_REJECTED']
          : [OPEN, 'ENDED', 'AFFILIATION_ENDED'];
    if (action === 'APPROVE') {
      await this.requireApproved(aff.doctorPartnerId, 'DOCTOR', 'The doctor is not currently approved');
      await this.requireApproved(aff.clinicPartnerId, 'CLINIC', 'The clinic is not currently approved');
    }
    await this.changeStatus(aff, from, to, event, { type: 'ADMIN', admin }, reason, { action: `AFFILIATION_${action}` });
    return this.prisma.doctorClinicAffiliation.findUnique({ where: { id: affiliationId } });
  }

  private async changeStatus(
    aff: { id: string; status: AffiliationStatus; doctorPartnerId: string; clinicPartnerId: string },
    from: AffiliationStatus[],
    to: AffiliationStatus,
    event: string,
    actor: Actor,
    reason: string | null,
    audit?: { action: string },
  ) {
    if (!from.includes(aff.status)) throw new BadRequestException(`This affiliation is ${aff.status.toLowerCase()} — that action is not possible`);
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.doctorClinicAffiliation.updateMany({
        where: { id: aff.id, status: aff.status },
        data: { status: to, ...(to === 'ENDED' ? { endedAt: now } : { decidedAt: now }), ...(reason ? { note: reason } : {}) },
      });
      if (changed.count !== 1) throw new ConflictException('This affiliation was just updated — refresh and try again');
      await this.recordOnBoth(tx, aff, event, actor, reason);
      if (audit && actor.type === 'ADMIN') {
        await writeAdminAudit(tx, actor.admin, { action: audit.action, entityType: 'DoctorClinicAffiliation', entityId: aff.id, reason, before: { status: aff.status }, after: { status: to } });
      }
    });
  }
}
