import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PatientsService } from './patients.service';
import { UpsertFamilyMemberDto } from './dto/upsert-family-member.dto';

// Guards the family-member fixes: the account holder is always "Myself" in the app and on the website, so a member
// saved as "Self" would show the same person twice; members added on the website carry a dob, not an age.
function setup(rows: Array<Record<string, unknown>> = []) {
  const prisma = {
    familyMember: {
      findMany: jest.fn().mockResolvedValue(rows),
      findUnique: jest.fn().mockResolvedValue({ id: 'm1', userId: 'u1' }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'new', age: null, gender: null, ...data })),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'm1', userId: 'u1', name: 'X', relation: 'Child', dob: new Date('2016-06-04T00:00:00.000Z'), age: null, ...data }),
      ),
    },
  };
  return { service: new PatientsService(prisma as never), prisma };
}

describe('PatientsService — family members', () => {
  it('never lists a member saved as "Self" (any case) — the account holder is shown as Myself', async () => {
    const { service, prisma } = setup();
    await service.listFamilyMembers('u1');
    expect(prisma.familyMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', NOT: { relation: { equals: 'self', mode: 'insensitive' } } } }),
    );
  });

  it.each(['Self', 'self', ' SELF '])('refuses to add a member with relation %p, and saves nothing', async (relation) => {
    const { service, prisma } = setup();
    await expect(service.createFamilyMember('u1', { name: 'Om Prakash', relation } as UpsertFamilyMemberDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.familyMember.create).not.toHaveBeenCalled();
  });

  it('refuses to rename an existing member to "Self"', async () => {
    const { service, prisma } = setup();
    await expect(service.updateFamilyMember('u1', 'm1', { name: 'Om Prakash', relation: 'Self' } as UpsertFamilyMemberDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.familyMember.update).not.toHaveBeenCalled();
  });

  it('works out age from the date of birth when only the dob was saved (website members)', async () => {
    const dob = new Date();
    dob.setUTCFullYear(dob.getUTCFullYear() - 10);
    dob.setUTCDate(dob.getUTCDate() - 1);
    const { service } = setup([{ id: 'a', name: 'Akarsh', relation: 'Child', dob, age: null }]);
    const [m] = await service.listFamilyMembers('u1');
    expect(m!.age).toBe(10);
  });

  it('keeps a stored age and leaves age empty when neither age nor dob is known', async () => {
    const { service } = setup([
      { id: 'a', name: 'Arya', relation: 'Child', dob: null, age: 6 },
      { id: 'b', name: 'Anupama', relation: 'Spouse', dob: null, age: null },
    ]);
    const list = await service.listFamilyMembers('u1');
    expect(list.map((m) => m.age)).toEqual([6, null]);
  });

  it('an edit that does not send dob keeps the saved date of birth', async () => {
    const { service, prisma } = setup();
    await service.updateFamilyMember('u1', 'm1', { name: 'Akarsh', relation: 'Child', age: 10 } as UpsertFamilyMemberDto);
    const data = prisma.familyMember.update.mock.calls[0]![0].data;
    expect('dob' in data).toBe(false);
  });

  it('an edit that sends dob: "" clears it on purpose', async () => {
    const { service, prisma } = setup();
    await service.updateFamilyMember('u1', 'm1', { name: 'Akarsh', relation: 'Child', dob: '' } as UpsertFamilyMemberDto);
    expect(prisma.familyMember.update.mock.calls[0]![0].data.dob).toBeNull();
  });
});

describe('UpsertFamilyMemberDto — what the apps send', () => {
  it.each([
    ['Male', 'MALE'],
    ['male', 'MALE'],
    ['F', 'FEMALE'],
    ['Other', 'OTHER'],
  ])('accepts gender %p as %p', async (sent, stored) => {
    const dto = plainToInstance(UpsertFamilyMemberDto, { name: 'Riya', relation: 'Child', gender: sent, age: '8' });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    expect(dto.gender).toBe(stored);
    expect(dto.age).toBe(8);
  });
});

describe('PatientsService — deleting a saved address', () => {
  function addressSetup(address: Record<string, unknown> | null, activeOrder: { orderNumber: string } | null = null) {
    const tx = {
      address: {
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue({ id: 'a2' }),
      },
    };
    const prisma = {
      address: { findUnique: jest.fn().mockResolvedValue(address), findMany: jest.fn().mockResolvedValue([]) },
      order: { findFirst: jest.fn().mockResolvedValue(activeOrder) },
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    return { service: new PatientsService(prisma as never), prisma, tx };
  }

  it('the list never shows deleted addresses', async () => {
    const { service, prisma } = addressSetup(null);
    await service.listAddresses('u1');
    expect(prisma.address.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', deletedAt: null } }));
  });

  it('refused (409, with the booking number) while a booking still needs it for the visit', async () => {
    const { service, tx } = addressSetup({ id: 'a1', userId: 'u1', isDefault: false, deletedAt: null }, { orderNumber: 'MDP-123' });
    await expect(service.deleteAddress('u1', 'a1')).rejects.toMatchObject({ status: 409, response: { code: 'ADDRESS_IN_USE', orderNumber: 'MDP-123' } });
    expect(tx.address.update).not.toHaveBeenCalled();
  });

  it('otherwise kept for past bookings but hidden (soft delete); the default moves to another address', async () => {
    const { service, prisma, tx } = addressSetup({ id: 'a1', userId: 'u1', isDefault: true, deletedAt: null });
    expect(await service.deleteAddress('u1', 'a1')).toEqual({ deleted: true });
    expect(prisma.order.findFirst.mock.calls[0][0].where).toEqual({ addressId: 'a1', status: { in: ['CONFIRMED', 'PHLEBOTOMIST_ASSIGNED'] } });
    expect(tx.address.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { deletedAt: expect.any(Date), isDefault: false } });
    expect(tx.address.update).toHaveBeenCalledWith({ where: { id: 'a2' }, data: { isDefault: true } });
  });

  it("someone else's, or an already deleted, address is not found", async () => {
    await expect(addressSetup({ id: 'a1', userId: 'u2', deletedAt: null }).service.deleteAddress('u1', 'a1')).rejects.toMatchObject({ status: 404 });
    await expect(addressSetup({ id: 'a1', userId: 'u1', deletedAt: new Date() }).service.deleteAddress('u1', 'a1')).rejects.toMatchObject({ status: 404 });
    await expect(addressSetup({ id: 'a1', userId: 'u1', deletedAt: new Date() }).service.updateAddress('u1', 'a1', { line1: 'x', city: 'y', pincode: '302020' } as never)).rejects.toMatchObject({ status: 404 });
  });
});
