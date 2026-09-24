import { Injectable, UnauthorizedException } from '@nestjs/common';
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
    return { id: lab.id, email: lab.email, name: lab.name, servicePincodes: lab.servicePincodes };
  }
}
