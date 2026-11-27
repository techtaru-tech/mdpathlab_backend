import PDFDocument from 'pdfkit';

/**
 * The partner MOU document: the standard terms (admin can replace them in Admin → Payouts → Commission settings),
 * the placeholders they may use, and the PDF itself. The terms are filled in and frozen on each MOU when it is
 * created (PartnerCommissionMou.termsSnapshot), so a document never changes after it was issued.
 *
 * The standard draft is a starting point only — it should be checked by MD Path Lab's lawyer / CA.
 */

export const MOU_PLACEHOLDERS: { key: string; meaning: string }[] = [
  { key: '{companyName}', meaning: 'MD Path Lab' },
  { key: '{partnerName}', meaning: "The doctor's / clinic's name" },
  { key: '{routinePercent}', meaning: 'Routine tests %' },
  { key: '{specialPercent}', meaning: 'Special tests %' },
  { key: '{packagePercent}', meaning: 'Packages %' },
  { key: '{effectiveDate}', meaning: 'Start date' },
  { key: '{holdDays}', meaning: 'Days before an earning can be withdrawn' },
  { key: '{minWithdrawal}', meaning: 'Minimum withdrawal (Rs.)' },
  { key: '{tdsPercent}', meaning: 'TDS %' },
];

export const DEFAULT_MOU_TERMS = `1. Purpose. {partnerName} (the "Partner") may refer patients to {companyName} (the "Company") for diagnostic tests. The Company will pay the Partner a referral commission on eligible bookings as set out in this MOU.

2. Commission. The Partner earns {routinePercent}% on Routine tests, {specialPercent}% on Special tests and {packagePercent}% on Health packages. The Company decides which tests are Routine or Special and shows it to the Partner on request. A package earns once, on the package price, not on each test inside it.

3. Eligible amount. Commission is worked out on the price of the tests after any discount. Home-collection and additional collection charges, courier / postage charges, taxes and wallet credits are not included.

4. Eligible bookings. A booking is eligible when it is made through the Partner's referral code / link or by the Partner through the Partner portal with the patient's consent. Commission is earned only after the payment has been received and the report has been issued. A cancelled booking earns nothing. A refund reduces the commission in proportion to the amount refunded. Commission already paid on a booking that is later cancelled or refunded is adjusted against the Partner's future earnings.

5. When the rates apply. These rates apply to bookings made on or after {effectiveDate}, and only after the Company has received and verified this MOU signed by the Partner. Each booking keeps the rate that applied when it was made.

6. Payment. The Partner can see every commission and its status in the Partner portal. An earning can be withdrawn {holdDays} day(s) after it is added, subject to a minimum withdrawal of Rs. {minWithdrawal}. Payment is made by bank transfer to the Partner's bank account registered in the portal. Tax deducted at source (TDS), where applicable, is deducted as required under the Income Tax Act.

7. Partner's responsibilities. The Partner will refer or book tests only with the patient's knowledge and consent; will not collect money from patients on the Company's behalf unless authorised in writing; will not misrepresent the Company's tests, prices or reports; will keep patient information confidential; and will follow all applicable laws and the code of conduct of the National Medical Commission / State Medical Council or any other authority that applies to the Partner.

8. Independent parties. The Partner is an independent party. Nothing in this MOU makes the Partner an employee, agent or representative of the Company.

9. Term and termination. This MOU remains in force until it is replaced by a new MOU or ended by either party with 30 days' written notice. The Company may suspend or end it at once if the Partner breaks any term of this MOU. Commission on bookings completed before the end date is paid as per this MOU.

10. Changes. The commission rates can be changed only by a new MOU signed by both parties.

11. Disputes. The parties will try to settle any dispute amicably. Any dispute that cannot be settled is subject to the jurisdiction of the courts at the place of the Company's registered office.`;

export type MouVars = {
  companyName: string;
  partnerName: string;
  routinePercent: number;
  specialPercent: number;
  packagePercent: number;
  effectiveDate: string;
  holdDays: number;
  minWithdrawal: number;
  tdsPercent: number;
};

export function fillMouTerms(template: string, v: MouVars): string {
  const values: Record<string, string> = {
    companyName: v.companyName,
    partnerName: v.partnerName,
    routinePercent: String(v.routinePercent),
    specialPercent: String(v.specialPercent),
    packagePercent: String(v.packagePercent),
    effectiveDate: v.effectiveDate,
    holdDays: String(v.holdDays),
    minWithdrawal: v.minWithdrawal.toLocaleString('en-IN'),
    tdsPercent: String(v.tdsPercent),
  };
  return template.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);
}

/** "27 Nov 2026" in IST. */
export function mouDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export type MouPdfData = {
  mouNumber: string;
  issuedOn: Date;
  effectiveFrom: Date;
  company: { name: string; address: string | null; phone: string | null; email: string | null };
  partner: { kind: string; name: string; lines: [string, string][] };
  rates: { routine: number; special: number; package: number };
  terms: string;
  status: string;
};

// The PDF's standard fonts have no Rupee sign.
const pdfText = (s: string) => s.replace(/₹/g, 'Rs. ');

const TEAL = '#265464';
const INK = '#11212C';
const GREY = '#5F6A77';

/** The MOU as an A4 PDF: header, both parties, the rates table, the terms and signature blocks for both sides. */
export function renderMouPdf(d: MouPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `MOU ${d.mouNumber}`, Author: d.company.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const left = 48;
    const width = doc.page.width - 96;

    // Header
    doc.font('Helvetica-Bold').fontSize(18).fillColor(TEAL).text(d.company.name, left, 48, { width: width - 180 });
    doc.font('Helvetica').fontSize(8.5).fillColor(GREY);
    if (d.company.address) doc.text(pdfText(d.company.address), { width: width - 180 });
    const contact = [d.company.phone, d.company.email].filter(Boolean).join('  ·  ');
    if (contact) doc.text(contact, { width: width - 180 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(`MOU No. ${d.mouNumber}`, left + width - 175, 50, { width: 175, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(`Date: ${mouDate(d.issuedOn)}`, left + width - 175, 64, { width: 175, align: 'right' });
    doc.y = Math.max(doc.y, 92);
    doc.moveTo(left, doc.y + 6).lineTo(left + width, doc.y + 6).lineWidth(1).strokeColor(TEAL).stroke();
    doc.y += 18;

    doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text('MEMORANDUM OF UNDERSTANDING', left, doc.y, { width, align: 'center' });
    doc.font('Helvetica').fontSize(9.5).fillColor(GREY).text('Referral partnership and commission', { width, align: 'center' });
    doc.moveDown(1.2);

    doc.font('Helvetica').fontSize(10).fillColor(INK).text(`This Memorandum of Understanding is made on ${mouDate(d.issuedOn)} between:`, left, doc.y, { width });
    doc.moveDown(0.6);

    // Parties
    const partyTop = doc.y;
    const colW = (width - 16) / 2;
    const party = (x: number, heading: string, name: string, lines: [string, string][], tag: string) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GREY).text(heading.toUpperCase(), x, partyTop, { width: colW });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(pdfText(name), x, doc.y + 2, { width: colW });
      doc.font('Helvetica').fontSize(9).fillColor(INK);
      for (const [k, v] of lines) if (v) doc.text(`${k}: ${pdfText(v)}`, x, doc.y + 1, { width: colW });
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GREY).text(`(the "${tag}")`, x, doc.y + 2, { width: colW });
      return doc.y;
    };
    const companyLines: [string, string][] = [
      ['Address', d.company.address ?? ''],
      ['Phone', d.company.phone ?? ''],
      ['Email', d.company.email ?? ''],
    ];
    const endA = party(left, 'First party', d.company.name, companyLines, 'Company');
    const endB = party(left + colW + 16, `Second party — ${d.partner.kind}`, d.partner.name, d.partner.lines, 'Partner');
    doc.y = Math.max(endA, endB) + 14;

    // Rates table
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text('Commission rates', left, doc.y);
    doc.moveDown(0.4);
    let y = doc.y;
    doc.rect(left, y, width, 20).fill(TEAL);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF').text('CATEGORY', left + 10, y + 6).text('COMMISSION', left + width - 130, y + 6, { width: 120, align: 'right' });
    y += 20;
    const rows: [string, number][] = [
      ['Routine tests', d.rates.routine],
      ['Special tests', d.rates.special],
      ['Health packages', d.rates.package],
    ];
    rows.forEach(([label, rate], i) => {
      if (i % 2 === 1) doc.rect(left, y, width, 20).fill('#F2F7F9');
      doc.font('Helvetica').fontSize(10).fillColor(INK).text(label, left + 10, y + 5.5);
      doc.font('Helvetica-Bold').text(`${rate}%`, left + width - 130, y + 5.5, { width: 120, align: 'right' });
      y += 20;
    });
    doc.y = y + 6;
    doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(
      `Applies to bookings made on or after ${mouDate(d.effectiveFrom)}, once the Company has verified this MOU signed by the Partner.`,
      left,
      doc.y,
      { width },
    );
    doc.moveDown(1);

    // Terms
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text('Terms', left, doc.y);
    doc.moveDown(0.4);
    for (const para of pdfText(d.terms).split(/\n\s*\n/)) {
      const text = para.replace(/\s*\n\s*/g, ' ').trim();
      if (!text) continue;
      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(text, left, doc.y, { width, align: 'justify', lineGap: 1.5 });
      doc.moveDown(0.55);
    }

    // Signatures (kept together on one page)
    if (doc.y > doc.page.height - 230) doc.addPage();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(INK).text('Agreed and signed by both parties:', left, doc.y, { width });
    const sigTop = doc.y + 16;
    const sign = (x: number, heading: string, name: string) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(heading, x, sigTop, { width: colW });
      doc.font('Helvetica').fontSize(9).fillColor(GREY).text(pdfText(name), x, sigTop + 13, { width: colW });
      const lines = ['Signature', 'Name', 'Stamp / seal', 'Date', 'Place'];
      lines.forEach((label, i) => {
        const ly = sigTop + 52 + i * 26;
        doc.moveTo(x + 70, ly + 9).lineTo(x + colW - 6, ly + 9).lineWidth(0.6).strokeColor('#B8C2CC').stroke();
        doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(label, x, ly, { width: 66 });
      });
    };
    sign(left, `For ${d.company.name}`, 'Authorised signatory');
    sign(left + colW + 16, 'Partner', d.partner.name);

    // Footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Writing inside the bottom margin would otherwise start a new page.
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(7.5).fillColor(GREY);
      doc.text(`MOU ${d.mouNumber}  ·  ${d.status}  ·  Page ${i + 1} of ${range.count}`, left, doc.page.height - 34, { width, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}
