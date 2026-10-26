import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DUPLICATE_REGISTRATION_MESSAGE, PartnersService } from './partners.service';

const uniqueViolation = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

const DOCTOR_REQUIREMENTS = [
  { documentKind: 'MEDICAL_REGISTRATION_CERTIFICATE', level: 'MANDATORY' },
  { documentKind: 'IDENTITY_PROOF', level: 'MANDATORY' },
  { documentKind: 'PHOTO', level: 'OPTIONAL' },
];

function partnerRow(over: Record<string, unknown> = {}) {
  return {
    id: 'pt1',
    type: 'DOCTOR',
    phone: '9876501234',
    status: 'DRAFT',
    displayName: 'Dr Asha Rao',
    email: 'asha@example.com',
    submittedAt: null,
    decidedAt: null,
    declarationAcceptedAt: null,
    doctorProfile: { partnerId: 'pt1', fullName: 'Dr Asha Rao' },
    clinicProfile: null,
    documents: [] as { kind: string; removedAt: Date | null }[],
    events: [],
    ...over,
  };
}

function setup(partner = partnerRow()) {
  const db = {
    referralPartner: {
      findUnique: jest.fn().mockResolvedValue(partner),
      findUniqueOrThrow: jest.fn().mockResolvedValue(partner),
      create: jest.fn().mockResolvedValue({ ...partner, status: 'DRAFT' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    referralPartnerEvent: { create: jest.fn().mockResolvedValue({}) },
    referralPartnerDocument: {
      findMany: jest.fn().mockImplementation(async () => partner.documents.filter((d) => !d.removedAt)),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    doctorProfile: { upsert: jest.fn().mockResolvedValue({}) },
    clinicProfile: { upsert: jest.fn().mockResolvedValue({}) },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = { ...db, $transaction: jest.fn((cb: (tx: typeof db) => unknown) => cb(db)) };
  const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
  const otp = { verify: jest.fn().mockResolvedValue(undefined) };
  const requirements = {
    forScope: jest.fn().mockResolvedValue(DOCTOR_REQUIREMENTS),
    requireSelectableClinicType: jest.fn(),
  };
  const emails = { submitted: jest.fn(), approved: jest.fn(), rejected: jest.fn(), suspended: jest.fn(), reactivated: jest.fn() };
  const notifications = { notifyAdmins: jest.fn().mockResolvedValue(undefined) };
  const service = new PartnersService(prisma as never, jwt as never, otp as never, requirements as never, emails as never, notifications as never);
  return { service, db, prisma, jwt, otp, requirements, emails, notifications };
}

const admin = { sub: 'a1', email: 'admin@example.com' };

describe('PartnersService — login', () => {
  it('refuses a brand-new account without accepting the terms, and creates nothing', async () => {
    const { service, db } = setup();
    db.referralPartner.findUnique.mockResolvedValue(null);
    await expect(service.login({ phone: '9876501234', code: '123456', type: 'DOCTOR' })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.referralPartner.create).not.toHaveBeenCalled();
  });

  it('does not reveal whether a number is registered without a valid OTP (the code is checked first)', async () => {
    const { service, db, otp } = setup();
    otp.verify.mockRejectedValue(new BadRequestException('Incorrect OTP'));
    for (const existing of [null, partnerRow()]) {
      db.referralPartner.findUnique.mockResolvedValue(existing);
      await expect(service.login({ phone: '9876501234', code: '000000', type: 'DOCTOR', termsAccepted: false })).rejects.toThrow('Incorrect OTP');
    }
    expect(db.referralPartner.findUnique).not.toHaveBeenCalled();
  });

  it('creates a DRAFT account with an event and issues a partner-realm token', async () => {
    const { service, db, jwt } = setup();
    db.referralPartner.findUnique.mockResolvedValue(null);
    const res = await service.login({ phone: '9876501234', code: '123456', type: 'DOCTOR', termsAccepted: true });
    expect(db.referralPartner.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'DOCTOR', phone: '9876501234' }) });
    expect(db.referralPartnerEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ event: 'ACCOUNT_CREATED', toStatus: 'DRAFT' }) });
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ type: 'partner', partnerType: 'DOCTOR' }));
    expect(res.accessToken).toBe('token');
  });

  it('signs in to the account a parallel request just created instead of failing', async () => {
    const { service, db } = setup();
    db.referralPartner.findUnique.mockResolvedValue(null);
    db.referralPartner.create.mockRejectedValue(uniqueViolation());
    const res = await service.login({ phone: '9876501234', code: '123456', type: 'DOCTOR', termsAccepted: true });
    expect(db.referralPartner.findUniqueOrThrow).toHaveBeenCalled();
    expect(res.partner.id).toBe('pt1');
  });
});

describe('PartnersService — application', () => {
  const doctorDto = {
    fullName: 'Dr Asha Rao',
    medicalCouncil: 'rajasthan medical council',
    registrationNumber: 'rmc 12 345',
    qualification: 'MBBS',
    city: 'Jaipur',
    pincode: '302020',
  };

  it('stores registration details normalised', async () => {
    const { service, db } = setup();
    await service.saveDoctorApplication('pt1', doctorDto);
    expect(db.doctorProfile.upsert.mock.calls[0][0].create).toMatchObject({ medicalCouncil: 'RAJASTHAN MEDICAL COUNCIL', registrationNumber: 'RMC12345' });
  });

  it('stores an empty authority (not NULL) when a clinic gives a number without one, so duplicates still collide', async () => {
    const { service, db, requirements } = setup(partnerRow({ type: 'CLINIC', doctorProfile: null }));
    requirements.requireSelectableClinicType.mockResolvedValue({ code: 'HOSPITAL', label: 'Hospital', registrationNumberRequired: true, registrationNumberLabel: null });
    const clinic = { clinicName: 'City Hospital', clinicTypeCode: 'HOSPITAL', address: '1 Main Road', city: 'Jaipur', pincode: '302020', contactPersonName: 'A B' };
    await service.saveClinicApplication('pt1', { ...clinic, registrationNumber: 'ce 123' });
    expect(db.clinicProfile.upsert.mock.calls[0][0].create).toMatchObject({ registrationAuthority: '', registrationNumber: 'CE123' });
    requirements.requireSelectableClinicType.mockResolvedValue({ code: 'SOLO_CLINIC', label: 'Clinic', registrationNumberRequired: false, registrationNumberLabel: null });
    await service.saveClinicApplication('pt1', { ...clinic, clinicTypeCode: 'SOLO_CLINIC' });
    expect(db.clinicProfile.upsert.mock.calls[1][0].create).toMatchObject({ registrationAuthority: null, registrationNumber: null });
  });

  it('refuses a clinic type that needs a registration number when none is given', async () => {
    const { service, db, requirements } = setup(partnerRow({ type: 'CLINIC', doctorProfile: null }));
    requirements.requireSelectableClinicType.mockResolvedValue({ code: 'HOSPITAL', label: 'Hospital', registrationNumberRequired: true, registrationNumberLabel: null });
    await expect(
      service.saveClinicApplication('pt1', { clinicName: 'City Hospital', clinicTypeCode: 'HOSPITAL', address: '1 Main Road', city: 'Jaipur', pincode: '302020', contactPersonName: 'A B' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.clinicProfile.upsert).not.toHaveBeenCalled();
  });

  it('answers a duplicate registration with the same generic message whatever matched', async () => {
    const { service, db } = setup();
    db.doctorProfile.upsert.mockRejectedValue(uniqueViolation());
    await expect(service.saveDoctorApplication('pt1', doctorDto)).rejects.toThrow(new ConflictException(DUPLICATE_REGISTRATION_MESSAGE));
  });

  it('refuses changes once the application is no longer editable', async () => {
    const { service, db } = setup(partnerRow({ status: 'PENDING' }));
    db.referralPartner.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.saveDoctorApplication('pt1', doctorDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.doctorProfile.upsert).not.toHaveBeenCalled();
  });

  it('refuses a document kind the requirement set does not ask for', async () => {
    const { service, db } = setup();
    await expect(service.addDocument('pt1', 'AUTHORIZATION_LETTER', { fileUrl: '/uploads/partner-documents/x.pdf', mimeType: 'application/pdf', sizeBytes: 10 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.referralPartnerDocument.create).not.toHaveBeenCalled();
  });

  it('refuses an upload beyond the document limit', async () => {
    const { service, db } = setup();
    db.referralPartnerDocument.count.mockResolvedValue(10);
    await expect(service.addDocument('pt1', 'PHOTO', { fileUrl: '/uploads/partner-documents/x.jpg', mimeType: 'image/jpeg', sizeBytes: 10 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('caps uploads per application including removed ones, so upload/remove loops cannot fill the disk', async () => {
    const { service, db } = setup();
    db.referralPartnerDocument.count.mockImplementation(async ({ where }: { where: { removedAt?: null } }) => ('removedAt' in where ? 2 : 30));
    await expect(service.addDocument('pt1', 'PHOTO', { fileUrl: '/uploads/partner-documents/x.jpg', mimeType: 'image/jpeg', sizeBytes: 10 })).rejects.toThrow(
      'Upload limit reached',
    );
    expect(db.referralPartnerDocument.create).not.toHaveBeenCalled();
  });

  it('refuses submission while a mandatory document is missing, and changes nothing', async () => {
    const { service, db, notifications } = setup(partnerRow({ documents: [{ kind: 'IDENTITY_PROOF', removedAt: null }] }));
    await expect(service.submit('pt1')).rejects.toThrow('Please upload: Medical registration certificate');
    expect(db.referralPartner.updateMany).not.toHaveBeenCalled();
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it('submits a complete application: PENDING, requirements snapshot, event, admin notification', async () => {
    const docs = [
      { kind: 'MEDICAL_REGISTRATION_CERTIFICATE', removedAt: null },
      { kind: 'IDENTITY_PROOF', removedAt: null },
    ];
    const { service, db, notifications, emails } = setup(partnerRow({ documents: docs }));
    await service.submit('pt1');
    const update = db.referralPartner.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'pt1', status: 'DRAFT' });
    expect(update.data).toMatchObject({ status: 'PENDING', submittedRequirements: DOCTOR_REQUIREMENTS });
    expect(db.referralPartnerEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ event: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'PENDING' }) });
    expect(notifications.notifyAdmins).toHaveBeenCalled();
    expect(emails.submitted).toHaveBeenCalled();
  });

  it('rolls back a submission when a document was removed in the meantime', async () => {
    const docs = [
      { kind: 'MEDICAL_REGISTRATION_CERTIFICATE', removedAt: null },
      { kind: 'IDENTITY_PROOF', removedAt: null },
    ];
    const { service, db } = setup(partnerRow({ documents: docs }));
    db.referralPartnerDocument.findMany.mockResolvedValue([{ kind: 'IDENTITY_PROOF', removedAt: null }]);
    await expect(service.submit('pt1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.referralPartnerEvent.create).not.toHaveBeenCalled();
  });
});

describe('PartnersService — admin review aids', () => {
  it('flags other accounts with the same registration number under a differently typed council', async () => {
    const { service, db, requirements } = setup();
    requirements.forScope.mockResolvedValue([]);
    db.referralPartner.findUnique.mockResolvedValue(
      partnerRow({ doctorProfile: { partnerId: 'pt1', registrationNumber: 'R1', medicalCouncil: 'RMC', affiliations: [] } }),
    );
    db.referralPartner.findMany.mockResolvedValue([
      { id: 'pt9', type: 'DOCTOR', status: 'APPROVED', displayName: 'Dr Same', phone: '9000000009', doctorProfile: { medicalCouncil: 'RAJASTHAN MEDICAL COUNCIL', registrationNumber: 'R1' }, clinicProfile: null },
    ]);
    const detail = await service.adminDetail('pt1');
    const where = db.referralPartner.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: 'pt1' });
    expect(where.OR).toEqual(expect.arrayContaining([{ doctorProfile: { registrationNumber: 'R1' } }, { phone: '9876501234' }]));
    expect(detail.possibleDuplicates).toEqual([
      expect.objectContaining({ id: 'pt9', matchedOn: ['registration number'], registration: 'RAJASTHAN MEDICAL COUNCIL · R1' }),
    ]);
  });
});

describe('PartnersService — admin decisions', () => {
  it('requires a reason to reject, suspend or reactivate', async () => {
    const { service } = setup(partnerRow({ status: 'PENDING' }));
    await expect(service.adminDecide('pt1', 'REJECT', '  ', admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a transition that is not allowed from the current status', async () => {
    const { service, db } = setup(partnerRow({ status: 'DRAFT' }));
    await expect(service.adminDecide('pt1', 'APPROVE', undefined, admin)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.referralPartner.updateMany).not.toHaveBeenCalled();
  });

  it('records status, actor, reason and an audit row for an allowed decision', async () => {
    const { service, db, emails } = setup(partnerRow({ status: 'PENDING' }));
    await service.adminDecide('pt1', 'REJECT', 'Registration certificate is unreadable', admin);
    expect(db.referralPartner.updateMany).toHaveBeenCalledWith({ where: { id: 'pt1', status: 'PENDING' }, data: expect.objectContaining({ status: 'REJECTED' }) });
    expect(db.referralPartnerEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ event: 'REJECTED', fromStatus: 'PENDING', toStatus: 'REJECTED', actorType: 'ADMIN', actorId: 'a1', actorLabel: 'admin@example.com', reason: 'Registration certificate is unreadable' }),
    });
    expect(db.adminAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'PARTNER_REJECT', entityId: 'pt1', adminId: 'a1' }) });
    expect(emails.rejected).toHaveBeenCalledWith(expect.anything(), 'Registration certificate is unreadable');
  });

  it('lets only one of two simultaneous decisions win', async () => {
    const { service, db } = setup(partnerRow({ status: 'PENDING' }));
    db.referralPartner.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.adminDecide('pt1', 'APPROVE', undefined, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(db.referralPartnerEvent.create).not.toHaveBeenCalled();
    expect(db.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
