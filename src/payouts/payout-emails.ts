import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service.js';
import { partnerStatusEmail } from '../mail/mail-templates.js';

type Recipient = { email: string | null; displayName: string | null };

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Payout emails to doctors and clinics — same template and fire-and-forget rules as PartnerEmails. */
@Injectable()
export class PayoutEmails {
  constructor(private readonly mail: MailService) {}

  private send(to: Recipient, template: string, subject: string, lines: string[]) {
    if (!to.email) return;
    void this.mail.sendToPartner(to.email, template, (ctx) =>
      partnerStatusEmail({ ...ctx, name: to.displayName, subject, heading: subject, lines, ctaLabel: 'Open your earnings', ctaUrl: `${ctx.appUrl}/partner/earnings` }),
    );
  }

  // Sent to the address on file, so a changed bank account is noticed even if someone else made the change.
  bankAccountChanged(to: Recipient, last4: string) {
    this.send(to, 'partner-bank-changed', 'Your payout bank account was changed', [
      `The bank account for your MD Path Labs payouts is now the account ending ${last4}.`,
      'If you did not make this change, contact us immediately.',
    ]);
  }

  withdrawalPaid(to: Recipient, netPaise: number, last4: string, utr: string) {
    this.send(to, 'partner-withdrawal-paid', 'Your withdrawal has been paid', [
      `${rupees(netPaise)} has been transferred to your account ending ${last4}.`,
      `Bank reference (UTR): ${utr}`,
    ]);
  }

  withdrawalRejected(to: Recipient, amountPaise: number, reason: string) {
    this.send(to, 'partner-withdrawal-rejected', 'Your withdrawal request was not processed', [
      `Your request to withdraw ${rupees(amountPaise)} was not processed, and the amount is back in your balance.`,
      `Reason: ${reason}`,
    ]);
  }
}
