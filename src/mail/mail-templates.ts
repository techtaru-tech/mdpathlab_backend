// HTML + plain-text bodies for every transactional email. Plain inline-styled HTML (no external
// CSS or images) so it renders the same in Gmail, Outlook and phone clients.

export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BRAND = '#0f6e8c';

type Layout = { preheader: string; heading: string; bodyHtml: string; cta?: { label: string; url: string }; unsubscribeUrl?: string; contact?: string };

function layout(l: Layout): string {
  const button = l.cta
    ? `<p style="margin:28px 0 8px"><a href="${escapeHtml(l.cta.url)}" style="background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;display:inline-block">${escapeHtml(l.cta.label)}</a></p>`
    : '';
  const unsubscribe = l.unsubscribeUrl
    ? `<p style="margin:10px 0 0"><a href="${escapeHtml(l.unsubscribeUrl)}" style="color:#6b7a86">Stop these emails</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f6f8;font-family:Arial,Helvetica,sans-serif;color:#1b2a33">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(l.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${BRAND};padding:18px 28px;color:#ffffff;font-size:18px;font-weight:700">MD Path Labs</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:20px">${escapeHtml(l.heading)}</h1>
${l.bodyHtml}
${button}
</td></tr>
<tr><td style="padding:18px 28px;background:#f8fafb;color:#6b7a86;font-size:12px;line-height:1.5">
This email was sent by MD Path Labs about your booking. Questions? Just reply to this email.
${l.contact ? '<br>' + escapeHtml(l.contact) : ''}
${unsubscribe}
</td></tr></table></td></tr></table></body></html>`;
}

const p = (html: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${html}</p>`;

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#6b7a86;font-size:14px;width:38%">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;font-weight:700">${escapeHtml(value)}</td></tr>`;
}
const table = (rows: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 12px;border-top:1px solid #e6ecf0;border-bottom:1px solid #e6ecf0">${rows}</table>`;

type Common = { name: string | null; appUrl: string; unsubscribeUrl: string; contact?: string };
const hello = (name: string | null) => p(`Hi ${escapeHtml(name?.trim() || 'there')},`);

export function bookingConfirmedEmail(c: Common & { orderNumber: string; orderId: string; items: string[]; total: number; collection: string; when: string; payment: string }): RenderedEmail {
  const url = `${c.appUrl}/booking/${c.orderId}`;
  const subject = `Booking confirmed — ${c.orderNumber}`;
  const html = layout({
    preheader: `Your booking ${c.orderNumber} is confirmed`,
    heading: 'Your booking is confirmed',
    bodyHtml:
      hello(c.name) +
      p('Thank you for booking with MD Path Labs. Here are your booking details.') +
      table(
        row('Order number', c.orderNumber) +
          row('Tests', c.items.join(', ')) +
          row('Collection', c.collection) +
          row('Date', c.when) +
          row('Amount', `₹${c.total}`) +
          row('Payment', c.payment),
      ) +
      p('You can track your booking and download your report from your account any time.'),
    cta: { label: 'View booking', url },
    unsubscribeUrl: c.unsubscribeUrl,
  });
  const text = `Hi ${c.name ?? 'there'},\n\nYour booking ${c.orderNumber} is confirmed.\nTests: ${c.items.join(', ')}\nCollection: ${c.collection}\nDate: ${c.when}\nAmount: ₹${c.total}\nPayment: ${c.payment}\n\nTrack it: ${url}\n\nStop these emails: ${c.unsubscribeUrl}`;
  return { subject, html, text };
}

export function reportReadyEmail(c: Common & { orderNumber: string; orderId: string }): RenderedEmail {
  const url = `${c.appUrl}/booking/${c.orderId}`;
  const subject = `Your report is ready — ${c.orderNumber}`;
  const html = layout({
    preheader: 'Your lab report is ready to view',
    heading: 'Your report is ready',
    bodyHtml:
      hello(c.name) +
      p(`The report for your booking <strong>${escapeHtml(c.orderNumber)}</strong> is ready.`) +
      p('For your privacy, the report is not attached to this email. Log in to your account to view and download it securely.'),
    cta: { label: 'View my report', url },
    unsubscribeUrl: c.unsubscribeUrl,
  });
  const text = `Hi ${c.name ?? 'there'},\n\nThe report for your booking ${c.orderNumber} is ready.\nFor your privacy it is not attached — log in to view and download it:\n${url}\n\nStop these emails: ${c.unsubscribeUrl}`;
  return { subject, html, text };
}

export function homeVisitAssignedEmail(c: Common & { phlebotomist: string; date: string; window: string }): RenderedEmail {
  const url = `${c.appUrl}/dashboard`;
  const subject = 'Phlebotomist assigned to your home visit';
  const html = layout({
    preheader: `${c.phlebotomist} will visit on ${c.date}`,
    heading: 'Phlebotomist assigned',
    bodyHtml:
      hello(c.name) +
      p('A phlebotomist has been assigned to your home visit request.') +
      table(row('Phlebotomist', c.phlebotomist) + row('Date', c.date) + row('Time window', c.window)),
    cta: { label: 'View my visits', url },
    unsubscribeUrl: c.unsubscribeUrl,
  });
  const text = `Hi ${c.name ?? 'there'},\n\nA phlebotomist (${c.phlebotomist}) has been assigned to your home visit on ${c.date}, ${c.window}.\n\n${url}\n\nStop these emails: ${c.unsubscribeUrl}`;
  return { subject, html, text };
}

export function homeVisitTestsAddedEmail(c: Common & { orderNumber: string; orderId: string; items: string[]; total: number }): RenderedEmail {
  const url = `${c.appUrl}/booking/${c.orderId}`;
  const subject = `Tests added to your home visit — ${c.orderNumber}`;
  const html = layout({
    preheader: `Order ${c.orderNumber}, total ₹${c.total}`,
    heading: 'Tests added to your home visit',
    bodyHtml:
      hello(c.name) +
      p('Your phlebotomist has added tests during the visit. Payment is collected in cash on collection.') +
      table(row('Order number', c.orderNumber) + row('Tests', c.items.join(', ')) + row('Amount', `₹${c.total}`)),
    cta: { label: 'View booking', url },
    unsubscribeUrl: c.unsubscribeUrl,
  });
  const text = `Hi ${c.name ?? 'there'},\n\nTests were added to your home visit.\nOrder: ${c.orderNumber}\nTests: ${c.items.join(', ')}\nAmount: ₹${c.total} (pay on collection)\n\n${url}\n\nStop these emails: ${c.unsubscribeUrl}`;
  return { subject, html, text };
}

export function testEmail(c: { appUrl: string }): RenderedEmail {
  const subject = 'MD Path Labs — test email';
  const html = layout({
    preheader: 'SMTP test',
    heading: 'Email is working',
    bodyHtml: p('This is a test email from the MD Path Labs admin panel. If you can read it, outgoing email is set up correctly.'),
    cta: { label: 'Open MD Path Labs', url: c.appUrl },
  });
  return { subject, html, text: `This is a test email from MD Path Labs. If you can read it, outgoing email works.\n${c.appUrl}` };
}

// ---------- Welcome, receipt/invoice, cancellation, assignment, pincode ----------

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

export function welcomeEmail(c: Common & { bonus?: number }): RenderedEmail {
  const url = `${c.appUrl}/tests`;
  const subject = 'Welcome to MD Path Labs';
  const bonus = c.bonus && c.bonus > 0 ? p(`We have also added a <strong>${escapeHtml(inr(c.bonus))} welcome bonus</strong> to your wallet. It is applied automatically on your next booking.`) : '';
  const html = layout({
    preheader: 'Your account is ready — book tests with free home sample collection',
    heading: 'Welcome to MD Path Labs',
    bodyHtml:
      hello(c.name) +
      p('Thank you for joining us. Your account is ready.') +
      p('Here is what you can do:') +
      `<ul style="margin:0 0 14px 18px;padding:0;font-size:15px;line-height:1.7"><li>Book lab tests and health packages</li><li>Choose free home sample collection or visit a collection centre</li><li>Get your reports in your account as soon as they are ready</li><li>Request a phlebotomist visit if you are not sure which tests you need</li></ul>` +
      bonus,
    cta: { label: 'Book a test', url },
    unsubscribeUrl: c.unsubscribeUrl,
    contact: c.contact,
  });
  const text = `Hi ${c.name ?? 'there'},\n\nWelcome to MD Path Labs. Your account is ready.\n${c.bonus && c.bonus > 0 ? `A welcome bonus of ${inr(c.bonus)} has been added to your wallet.\n` : ''}Book a test: ${url}\n\nStop these emails: ${c.unsubscribeUrl}`;
  return { subject, html, text };
}

export type InvoiceLine = { name: string; price: number };

export function paymentReceiptEmail(
  c: Common & {
    orderNumber: string;
    orderId: string;
    paidOn: string;
    lines: InvoiceLine[];
    subtotal: number;
    discount: number;
    collectionFee: number;
    walletUsed: number;
    total: number;
    method: string;
    reference?: string | null;
  },
): RenderedEmail {
  const url = `${c.appUrl}/booking/${c.orderId}`;
  const invoiceNo = `INV-${c.orderNumber}`;
  const subject = `Payment receipt — ${c.orderNumber}`;
  const lineRows = c.lines
    .map((l) => `<tr><td style="padding:6px 0;font-size:14px">${escapeHtml(l.name)}</td><td align="right" style="padding:6px 0;font-size:14px">${escapeHtml(inr(l.price))}</td></tr>`)
    .join('');
  const sumRow = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 0;font-size:14px;${bold ? 'font-weight:700' : 'color:#6b7a86'}">${escapeHtml(label)}</td><td align="right" style="padding:4px 0;font-size:14px;${bold ? 'font-weight:700' : ''}">${escapeHtml(value)}</td></tr>`;
  const html = layout({
    preheader: `Receipt for order ${c.orderNumber} — ${inr(c.total)}`,
    heading: 'Payment receipt',
    bodyHtml:
      hello(c.name) +
      p('Thank you. We have received your payment. This email is your invoice for the booking below.') +
      table(row('Invoice number', invoiceNo) + row('Order number', c.orderNumber) + row('Date', c.paidOn) + row('Payment method', c.method) + (c.reference ? row('Reference', c.reference) : '')) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;border-bottom:1px solid #e6ecf0"><tr><td style="padding:6px 0;font-size:12px;font-weight:700;color:#6b7a86;text-transform:uppercase">Item</td><td align="right" style="padding:6px 0;font-size:12px;font-weight:700;color:#6b7a86;text-transform:uppercase">Price</td></tr>${lineRows}</table>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">${sumRow('Subtotal', inr(c.subtotal))}${c.discount > 0 ? sumRow('Discount', '− ' + inr(c.discount)) : ''}${c.collectionFee > 0 ? sumRow('Collection fee', inr(c.collectionFee)) : ''}${c.walletUsed > 0 ? sumRow('Paid from wallet', '− ' + inr(c.walletUsed)) : ''}${sumRow('Amount paid', inr(c.total), true)}</table>`,
    cta: { label: 'View booking', url },
    unsubscribeUrl: c.unsubscribeUrl,
    contact: c.contact,
  });
  const textLines = c.lines.map((l) => `  ${l.name}  ${inr(l.price)}`).join('\n');
  const text = `Hi ${c.name ?? 'there'},\n\nPayment receipt (invoice ${invoiceNo})\nOrder: ${c.orderNumber}\nDate: ${c.paidOn}\nMethod: ${c.method}${c.reference ? `\nReference: ${c.reference}` : ''}\n\n${textLines}\n\nSubtotal: ${inr(c.subtotal)}${c.discount > 0 ? `\nDiscount: -${inr(c.discount)}` : ''}${c.collectionFee > 0 ? `\nCollection fee: ${inr(c.collectionFee)}` : ''}${c.walletUsed > 0 ? `\nPaid from wallet: -${inr(c.walletUsed)}` : ''}\nAmount paid: ${inr(c.total)}\n\n${url}\n\nStop these emails: ${c.unsubscribeUrl}`;
  return { subject, html, text };
}

export function orderCancelledEmail(c: Common & { orderNumber: string; orderId: string; reason?: string | null; walletRefunded: number; wasPaid: boolean }): RenderedEmail {
  const url = `${c.appUrl}/tests`;
  const subject = `Booking cancelled — ${c.orderNumber}`;
  const refund =
    c.walletRefunded > 0
      ? p(`<strong>${escapeHtml(inr(c.walletRefunded))}</strong> has been returned to your MD Path Labs wallet.`)
      : c.wasPaid
        ? p('Since you had already paid for this booking, our team will get in touch with you about your refund.')
        : '';
  const html = layout({
    preheader: `Booking ${c.orderNumber} has been cancelled`,
    heading: 'Your booking was cancelled',
    bodyHtml:
      hello(c.name) +
      p(`Your booking <strong>${escapeHtml(c.orderNumber)}</strong> has been cancelled.`) +
      (c.reason ? p(`Reason: ${escapeHtml(c.reason)}`) : '') +
      refund +
      p('You can book again any time.'),
    cta: { label: 'Book a test', url },
    unsubscribeUrl: c.unsubscribeUrl,
    contact: c.contact,
  });
  const text = `Hi ${c.name ?? 'there'},\n\nYour booking ${c.orderNumber} has been cancelled.${c.reason ? `\nReason: ${c.reason}` : ''}${c.walletRefunded > 0 ? `\n${inr(c.walletRefunded)} has been returned to your wallet.` : c.wasPaid ? '\nOur team will contact you about your refund.' : ''}\n\nBook again: ${url}\n\nStop these emails: ${c.unsubscribeUrl}`;
  return { subject, html, text };
}

export function phlebotomistAssignedEmail(c: Common & { orderNumber: string; orderId: string; phlebotomist: string; when: string }): RenderedEmail {
  const url = `${c.appUrl}/booking/${c.orderId}`;
  const subject = `Phlebotomist assigned — ${c.orderNumber}`;
  const html = layout({
    preheader: `${c.phlebotomist} will collect your sample`,
    heading: 'Your phlebotomist is assigned',
    bodyHtml:
      hello(c.name) +
      p(`A phlebotomist has been assigned to your booking <strong>${escapeHtml(c.orderNumber)}</strong>.`) +
      table(row('Phlebotomist', c.phlebotomist) + row('Collection', c.when)) +
      p('Please keep your phone handy. You will be asked for a short code when the phlebotomist arrives, so please do not share it with anyone before then.'),
    cta: { label: 'Track booking', url },
    unsubscribeUrl: c.unsubscribeUrl,
    contact: c.contact,
  });
  const text = `Hi ${c.name ?? 'there'},\n\n${c.phlebotomist} has been assigned to your booking ${c.orderNumber}.\nCollection: ${c.when}\n\nTrack it: ${url}\n\nStop these emails: ${c.unsubscribeUrl}`;
  return { subject, html, text };
}

export function pincodeAvailableEmail(c: Common & { pincode: string }): RenderedEmail {
  const url = `${c.appUrl}/tests`;
  const subject = `We now serve pincode ${c.pincode}`;
  const html = layout({
    preheader: `MD Path Labs is now available at ${c.pincode}`,
    heading: 'Good news — we now serve your area',
    bodyHtml: hello(c.name) + p(`You asked us to let you know when we start serving pincode <strong>${escapeHtml(c.pincode)}</strong>. We are now available there.`) + p('You can book tests with home sample collection right away.'),
    cta: { label: 'Book a test', url },
    unsubscribeUrl: c.unsubscribeUrl,
    contact: c.contact,
  });
  const text = `Hi ${c.name ?? 'there'},\n\nMD Path Labs is now available at pincode ${c.pincode}.\nBook a test: ${url}\n\nStop these emails: ${c.unsubscribeUrl}`;
  return { subject, html, text };
}
