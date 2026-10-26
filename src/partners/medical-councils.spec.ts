import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DoctorApplicationDto } from './dto/partner-application.dto';
import { MEDICAL_COUNCILS } from './medical-councils';

const doctor = (medicalCouncil: unknown) =>
  plainToInstance(DoctorApplicationDto, { fullName: 'Dr Test', medicalCouncil, registrationNumber: 'RMC 1', qualification: 'MBBS', city: 'Jaipur', pincode: '302020' });
const councilErrors = async (value: unknown) => (await validate(doctor(value))).filter((e) => e.property === 'medicalCouncil');

describe('medical council must come from the list', () => {
  it('accepts every listed council, in any case or spacing, stored upper-case', async () => {
    for (const c of MEDICAL_COUNCILS) expect(await councilErrors(c)).toEqual([]);
    expect(await councilErrors('  rajasthan   medical council ')).toEqual([]);
    expect(doctor('rajasthan medical council').medicalCouncil).toBe('RAJASTHAN MEDICAL COUNCIL');
  });

  it('refuses free text, abbreviations and anything that is not a council', async () => {
    for (const bad of ['RMC', 'Rajsthan Medical Store', 'NMC', '', 'Rajasthan Medical Council<script>', 42, null]) {
      expect((await councilErrors(bad)).length).toBeGreaterThan(0);
    }
  });
});
