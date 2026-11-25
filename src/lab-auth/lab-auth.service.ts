import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class LabAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const lab = await this.prisma.lab.findUnique({ where: { email } });
    if (!lab || lab.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, lab.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.jwt.signAsync({ sub: lab.id, email: lab.email, labId: lab.id, type: 'lab' });
    return { accessToken, lab: { id: lab.id, email: lab.email, name: lab.name } };
  }

  async me(id: string) {
    const lab = await this.prisma.lab.findUnique({ where: { id } });
    if (!lab) throw new UnauthorizedException();
    return { id: lab.id, email: lab.email, name: lab.name, servicePincodes: lab.servicePincodes, address: lab.address, lat: lab.lat, lng: lab.lng };
  }

  /**
   * The lab sets its own map pin. The additional collection charge is measured from it (straight line to the
   * patient's address pin), so a lab without a pin never charges it. Both null removes the pin.
   */
  async setLocation(id: string, lat: number | null, lng: number | null) {
    if ((lat === null) !== (lng === null)) throw new BadRequestException('Send both lat and lng, or both null to remove the pin');
    await this.prisma.lab.update({ where: { id }, data: { lat, lng } });
    return this.me(id);
  }
}
