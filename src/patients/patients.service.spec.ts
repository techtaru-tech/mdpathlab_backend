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
