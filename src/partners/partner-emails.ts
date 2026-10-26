import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service.js';
import { partnerStatusEmail } from '../mail/mail-templates.js';

type Recipient = { email: string | null; displayName: string | null };

/**
 * Status emails to doctors and clinics. Fire-and-forget: MailService never throws, and nothing is sent when the
 * applicant gave no email (it is optional and never verified).
 */
@Injectable()
export class PartnerEmails {
  constructor(private readonly mail: MailService) {}

  private send(to: Recipient, template: string, subject: string, heading: string, lines: string[]) {
    if (!to.email) return;
    void this.mail.sendToPartner(to.email, template, (ctx) =>
      partnerStatusEmail({ ...ctx, name: to.displayName, subject, heading, lines, ctaLabel: 'Open the partner portal', ctaUrl: `${ctx.appUrl}/partner` }),
    );
  }

  submitted(to: Recipient) {
    this.send(to, 'partner-submitted', 'We received your application', 'Application received', [
      'Thank you for applying to partner with MD Path Labs. Our team will review your details and documents.',
      'We will email you once a decision is made. You can check the status in the partner portal at any time.',
    ]);
  }

  approved(to: Recipient) {
    this.send(to, 'partner-approved', 'Your application is approved', 'Welcome aboard — you are approved', [
      'Your partner account with MD Path Labs has been approved.',
      'Sign in to the partner portal to see your account.',
    ]);
  }

  rejected(to: Recipient, reason: string) {
    this.send(to, 'partner-rejected', 'Your application needs changes', 'Your application was not approved', [
      `Reason: ${reason}`,
      'You can correct your details or documents in the partner portal and submit the application again.',
    ]);
  }

  suspended(to: Recipient, reason: string) {
    this.send(to, 'partner-suspended', 'Your partner account is suspended', 'Your account has been suspended', [
      `Reason: ${reason}`,
      'Please reply to this email if you have any questions.',
    ]);
  }

  reactivated(to: Recipient) {
    this.send(to, 'partner-reactivated', 'Your partner account is active again', 'Your account is active again', [
      'Your partner account with MD Path Labs has been reactivated.',
    ]);
  }

  affiliationUpdated(to: Recipient, message: string) {
    this.send(to, 'partner-affiliation', 'Clinic affiliation update', 'Clinic affiliation update', [message]);
  }
}
