import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PartnerAffiliationsService } from './partner-affiliations.service';

const partners: Record<string, { id: string; type: string; status: string; email: string | null; displayName: string }> = {
  doc: { id: 'doc', type: 'DOCTOR', status: 'APPROVED', email: 'd@example.com', displayName: 'Dr A' },
  clinic: { id: 'clinic', type: 'CLINIC', status: 'APPROVED', email: 'c@example.com', displayName: 'City Clinic' },
  pendingClinic: { id: 'pendingClinic', type: 'CLINIC', status: 'PENDING', email: null, displayName: 'New Clinic' },
};

function setup() {
  const db = {
    referralPartner: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => partners[where.id] ?? null), findMany: jest.fn() },
    doctorClinicAffiliation: {
      create: jest.fn().mockResolvedValue({ id: 'af1', doctorPartnerId: 'doc', clinicPartnerId: 'clinic' }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    referralPartnerEvent: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    adminAuditLog: { create: jest.fn() },
  };
  const prisma = { ...db, $transaction: jest.fn((cb: (tx: typeof db) => unknown) => cb(db)) };
  const emails = { affiliationUpdated: jest.fn() };
  return { service: new PartnerAffiliationsService(prisma as never, emails as never), db, emails };
}

describe('PartnerAffiliationsService', () => {
  it('lets an approved doctor ask an approved clinic, recording it on both histories', async () => {
    const { service, db, emails } = setup();
    await service.request('doc', 'clinic');
    expect(db.doctorClinicAffiliation.create).toHaveBeenCalledWith({ data: { doctorPartnerId: 'doc', clinicPartnerId: 'clinic' } });
    expect(db.referralPartnerEvent.createMany.mock.calls[0][0].data.map((e: { partnerId: string }) => e.partnerId)).toEqual(['doc', 'clinic']);
    expect(emails.affiliationUpdated).toHaveBeenCalledWith(partners.clinic, expect.any(String));
  });

  it('does not reveal a clinic that is not approved', async () => {
    const { service, db } = setup();
    await expect(service.request('doc', 'pendingClinic')).rejects.toThrow(new BadRequestException('Clinic not found'));
    expect(db.doctorClinicAffiliation.create).not.toHaveBeenCalled();
  });

  it('refuses a second open request for the same pair', async () => {
    const { service, db } = setup();
    db.doctorClinicAffiliation.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }));
    await expect(service.request('doc', 'clinic')).rejects.toBeInstanceOf(ConflictException);
  });

  it('request → withdraw → request again cannot spam a clinic: 2 per clinic and 10 in total per 24 hours', async () => {
    const { service, db, emails } = setup();
    db.doctorClinicAffiliation.count.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    await expect(service.request('doc', 'clinic')).rejects.toMatchObject({ status: 429 });
    db.doctorClinicAffiliation.count.mockResolvedValueOnce(0).mockResolvedValueOnce(10);
    await expect(service.request('doc', 'clinic')).rejects.toMatchObject({ status: 429 });
    expect(db.doctorClinicAffiliation.create).not.toHaveBeenCalled();
    expect(emails.affiliationUpdated).not.toHaveBeenCalled();
    db.doctorClinicAffiliation.count.mockResolvedValueOnce(1).mockResolvedValueOnce(9);
    await service.request('doc', 'clinic');
    expect(db.doctorClinicAffiliation.create).toHaveBeenCalledTimes(1);
  });

  it('only the clinic a request is addressed to can answer it', async () => {
    const { service, db } = setup();
    db.doctorClinicAffiliation.findFirst.mockResolvedValue(null);
    await expect(service.respond('clinic', 'someone-elses-request', true)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.doctorClinicAffiliation.findFirst).toHaveBeenCalledWith({ where: { id: 'someone-elses-request', clinicPartnerId: 'clinic' } });
  });

  it('lets only an approved doctor search for clinics', async () => {
    const { service, db } = setup();
    db.referralPartner.findMany.mockResolvedValue([]);
    await expect(service.searchClinics('clinic', 'City')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.searchClinics('doc', 'City')).resolves.toEqual([]);
    expect(db.referralPartner.findMany.mock.calls[0][0].where).toMatchObject({ type: 'CLINIC', status: 'APPROVED' });
  });

  it('cannot end an affiliation that is already ended', async () => {
    const { service, db } = setup();
    db.doctorClinicAffiliation.findFirst.mockResolvedValue({ id: 'af1', status: 'ENDED', doctorPartnerId: 'doc', clinicPartnerId: 'clinic' });
    await expect(service.end('doc', 'DOCTOR', 'af1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.doctorClinicAffiliation.updateMany).not.toHaveBeenCalled();
  });

  it('shows a clinic the doctor\'s professional details only — no mobile number or email', async () => {
    const { service, db } = setup();
    db.doctorClinicAffiliation.findMany.mockResolvedValue([
      { id: 'af1', status: 'REQUESTED', note: null, createdAt: new Date(), decidedAt: null, endedAt: null, doctor: { partnerId: 'doc', fullName: 'Dr A', city: 'Jaipur', qualification: 'MBBS', specialization: null } },
    ]);
    const [row] = await service.listForPartner('clinic', 'CLINIC');
    expect(JSON.stringify(row)).not.toMatch(/phone|email|@/);
    const select = db.doctorClinicAffiliation.findMany.mock.calls[0][0].include.doctor.select;
    expect(Object.keys(select)).toEqual(['partnerId', 'fullName', 'city', 'qualification', 'specialization']);
  });
});
