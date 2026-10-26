import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { FeatureSwitches } from './feature-switches.js';

/**
 * Doctor/clinic registration stays switched off until an admin turns it on (Admin → Settings → Doctors &
 * Referrals; off by default). Applied only to the partner-facing controllers (never globally): while the feature
 * is off they answer 404, as if the routes did not exist. Admin partner screens are not behind this guard, so
 * settings can be prepared.
 */
@Injectable()
export class PartnersEnabledGuard implements CanActivate {
  constructor(private readonly switches: FeatureSwitches) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.switches.partnersEnabled())) throw new NotFoundException();
    return true;
  }
}
