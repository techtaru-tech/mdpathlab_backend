import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { FeatureSwitches } from '../partners/feature-switches.js';

/**
 * Referral links and attribution stay switched off until an admin turns them on — a separate switch from doctor
 * registration, both in Admin → Settings → Doctors & Referrals and off by default. On the public, patient and
 * partner referral routes only (never global): 404 while the feature is off.
 */
@Injectable()
export class ReferralsEnabledGuard implements CanActivate {
  constructor(private readonly switches: FeatureSwitches) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.switches.referralsEnabled())) throw new NotFoundException();
    return true;
  }
}
