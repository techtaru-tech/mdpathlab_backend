import { existsSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';

/**
 * The partner MOU document: the standard terms (admin can replace them in Admin → Payouts → Commission settings),
 * the placeholders they may use, and the PDF itself in MD Path Lab's colours with its logo. The terms are filled in
 * and frozen on each MOU when it is created (PartnerCommissionMou.termsSnapshot), so a document never changes
 * after it was issued.
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

4. Eligible bookings. A booking is eligible when it is made through the Partner's referral code / link or by the Partner through the Partner portal with the patient's consent. Commission is earned once the report has been issued. A cancelled booking earns nothing. A refund reduces the commission in proportion to the amount refunded. Commission already paid on a booking that is later cancelled or refunded is adjusted against the Partner's future earnings.

5. When the rates apply. These rates apply to bookings made on or after {effectiveDate}, once the Partner has accepted this MOU. Each booking keeps the rate that applied when it was made.

6. Payment. The Partner can see every commission and its status in the Partner portal. An earning can be withdrawn {holdDays} day(s) after it is added, subject to a minimum withdrawal of Rs. {minWithdrawal}. Payment is made by bank transfer to the Partner's bank account registered in the portal. Tax deducted at source (TDS), where applicable, is deducted as required under the Income Tax Act.

7. Partner's responsibilities. The Partner will refer or book tests only with the patient's knowledge and consent; will not collect money from patients on the Company's behalf unless authorised in writing; will not misrepresent the Company's tests, prices or reports; will keep patient information confidential; and will follow all applicable laws and the code of conduct of the National Medical Commission / State Medical Council or any other authority that applies to the Partner.

8. Independent parties. The Partner is an independent party. Nothing in this MOU makes the Partner an employee, agent or representative of the Company.

9. Term and replacement. This MOU remains in force until (a) a new MOU signed by both parties comes into force — on that date this MOU ends automatically and is replaced by the new one, whose rates apply to bookings made from then on; or (b) either party ends it by giving 30 days' written notice (email or a notice in the Partner portal is enough). The Company may suspend or end it at once if the Partner breaks any term of this MOU. Bookings made before this MOU ends keep its rates and are paid as per this MOU.

10. Changes. The commission rates can be changed only by a new MOU signed by both parties, or by the Company ending this MOU with notice under clause 9. Once this MOU has been replaced or has ended, the Partner cannot claim its rates for bookings made after that date.

11. Electronic acceptance. The Partner may accept this MOU online in the Partner portal by entering a one-time password (OTP) sent to the Partner's registered mobile number. Such acceptance has the same effect as the Partner's signature, and the Company's record of it (date, time and mobile number) is proof of acceptance. This MOU is issued signed on behalf of the Company.

12. Disputes. The parties will try to settle any dispute amicably. Any dispute that cannot be settled is subject to the jurisdiction of the courts at the place of the Company's registered office.`;

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

/** "27 Nov 2026, 10:42 am" in IST. */
export function istDateTime(d: Date): string {
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

/** "27 Nov 2026" in IST. */
export function mouDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export type MouPdfData = {
  mouNumber: string;
  issuedOn: Date;
  effectiveFrom: Date;
  company: { name: string; legalName?: string | null; address: string | null; phone: string | null; email: string | null };
  partner: { kind: string; name: string; lines: [string, string][] };
  rates: { routine: number; special: number; package: number };
  terms: string;
  status: string;
  /** MD Path Lab's side, printed already signed: signatory, title and a PNG/JPEG of the signature + stamp. */
  companySignatory?: { name: string | null; designation: string | null; imagePath: string | null };
  /** Set once admin verified the partner's signed copy — printed under the signatures. */
  verifiedAt?: Date | null;
  /** A later MOU that replaced this one, printed as a notice on page 1. */
  supersededBy?: { mouNumber: string; from: Date } | null;
  /** Accepted online by the partner with an OTP to their registered mobile. */
  acceptedOnline?: { at: Date; phoneMasked: string } | null;
};

// MD Path Lab brand (web/src/styles.css: --primary / --primary-deep / --secondary / --accent; logo colours).
const TEAL = '#38768C';
const TEAL_DEEP = '#265464';
const NAVY = '#2D2B6B';
const SOFT = '#EEF5F7';
const LINE = '#C9DCE2';
const INK = '#16232D';
const GREY = '#5F6A77';
const GREEN = '#1E7A43';

const LOGO = join(process.cwd(), 'assets', 'brand', 'mdpathlab-logo.png');

// The PDF's standard fonts have no Rupee sign.
const pdfText = (s: string) => s.replace(/₹/g, 'Rs. ');

/** The MOU as an A4 PDF in MD Path Lab's colours: logo header, both parties, the rates, the terms and signatures. */
export function renderMouPdf(d: MouPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 56, left: 48, right: 48 }, bufferPages: true, info: { Title: `MOU ${d.mouNumber}`, Author: d.company.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const hasLogo = existsSync(LOGO);
    const L = 48;
    const W = doc.page.width - 96;
    const pageW = doc.page.width;

    // ---------------------------------------------------------------- header
    doc.rect(0, 0, pageW, 8).fill(TEAL_DEEP);
    doc.rect(0, 8, pageW, 3).fill(NAVY);
    const headTop = 30;
    let textX = L;
    if (hasLogo) {
      doc.image(LOGO, L, headTop, { width: 68, height: 68 });
      textX = L + 82;
    }
    doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY).text(d.company.name.toUpperCase(), textX, headTop + 4, { width: 260, characterSpacing: 0.5 });
    if (d.company.legalName) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(TEAL).text(d.company.legalName, textX, doc.y + 1, { width: 260 });
    doc.font('Helvetica').fontSize(8).fillColor(GREY);
    if (d.company.address) doc.text(pdfText(d.company.address), textX, doc.y + 3, { width: 250 });
    const contact = [d.company.phone, d.company.email].filter(Boolean).join('   |   ');
    if (contact) doc.text(contact, textX, doc.y + 1, { width: 250 });
    const headBottom = Math.max(doc.y, headTop + 68);

    // MOU number card (top right)
    const cardW = 160;
    const cardX = L + W - cardW;
    doc.roundedRect(cardX, headTop, cardW, 62, 8).fill(SOFT);
    doc.roundedRect(cardX, headTop, 4, 62, 2).fill(TEAL);
    doc.font('Helvetica').fontSize(7.5).fillColor(GREY).text('MOU NUMBER', cardX + 14, headTop + 9, { characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(d.mouNumber, cardX + 14, headTop + 20);
    doc.font('Helvetica').fontSize(8).fillColor(GREY).text(`Issued ${mouDate(d.issuedOn)}`, cardX + 14, headTop + 36);
    const statusColor = d.verifiedAt ? GREEN : TEAL;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(statusColor).text(d.status.toUpperCase(), cardX + 14, headTop + 48, { characterSpacing: 0.6 });

    // ---------------------------------------------------------------- title band
    let y = headBottom + 18;
    doc.roundedRect(L, y, W, 50, 10).fill(TEAL_DEEP);
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#FFFFFF').text('MEMORANDUM OF UNDERSTANDING', L, y + 11, { width: W, align: 'center', characterSpacing: 1.2 });
    doc.font('Helvetica').fontSize(9).fillColor('#D5E8EE').text('Referral partnership & commission agreement', L, y + 31, { width: W, align: 'center' });
    y += 66;

    // Superseded notice
    if (d.supersededBy) {
      doc.roundedRect(L, y, W, 26, 6).fillAndStroke('#FFF4E5', '#F0C27A');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#9A5B00').text(
        `Replaced by MOU ${d.supersededBy.mouNumber} from ${mouDate(d.supersededBy.from)} — this MOU's rates do not apply to bookings made from that date.`,
        L + 10,
        y + 8.5,
        { width: W - 20, align: 'center' },
      );
      y += 36;
    }

    doc.font('Helvetica').fontSize(10).fillColor(INK).text(`This Memorandum of Understanding is made on ${mouDate(d.issuedOn)} between:`, L, y, { width: W });
    y = doc.y + 10;

    // ---------------------------------------------------------------- parties (two cards)
    const colW = (W - 14) / 2;
    const partyCard = (x: number, label: string, name: string, sub: string | null, lines: [string, string][], tag: string) => {
      const top = y;
      // measure first
      let h = 14 + 12 + 16 + (sub ? 12 : 0);
      doc.font('Helvetica').fontSize(8.5);
      for (const [k, v] of lines) if (v) h += doc.heightOfString(`${k}: ${pdfText(v)}`, { width: colW - 28 }) + 2;
      h += 22;
      return { top, h, draw: (height: number) => {
        doc.roundedRect(x, top, colW, height, 8).fill(SOFT);
        doc.roundedRect(x, top, colW, 4, 2).fill(TEAL);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(TEAL).text(label.toUpperCase(), x + 14, top + 14, { width: colW - 28, characterSpacing: 0.8 });
        doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(pdfText(name), x + 14, top + 26, { width: colW - 28 });
        if (sub) doc.font('Helvetica-Oblique').fontSize(8).fillColor(TEAL).text(sub, x + 14, doc.y + 1, { width: colW - 28 });
        doc.moveDown(0.3);
        for (const [k, v] of lines) {
          if (!v) continue;
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GREY).text(`${k}: `, x + 14, doc.y + 2, { continued: true, width: colW - 28 });
          doc.font('Helvetica').fillColor(INK).text(pdfText(v));
        }
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(GREY).text(`(the "${tag}")`, x + 14, top + height - 18, { width: colW - 28 });
      } };
    };
    const companyLines: [string, string][] = [
      ['Address', d.company.address ?? ''],
      ['Phone', d.company.phone ?? ''],
      ['Email', d.company.email ?? ''],
    ];
    const a = partyCard(L, 'First party', d.company.name, d.company.legalName ?? null, companyLines, 'Company');
    const b = partyCard(L + colW + 14, `Second party — ${d.partner.kind}`, d.partner.name, null, d.partner.lines, 'Partner');
    const partyH = Math.max(a.h, b.h);
    a.draw(partyH);
    b.draw(partyH);
    y = a.top + partyH + 20;

    // ---------------------------------------------------------------- rates (three tiles)
    const heading = (text: string) => {
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(NAVY).text(text, L, y);
      doc.rect(L, doc.y + 3, 34, 2.5).fill(TEAL);
      y = doc.y + 14;
    };
    heading('Commission rates');
    const tileW = (W - 24) / 3;
    const tiles: [string, number, string][] = [
      ['Routine tests', d.rates.routine, 'CBC, sugar, LFT, KFT, thyroid…'],
      ['Special tests', d.rates.special, 'Tests marked Special'],
      ['Health packages', d.rates.package, 'On the package price'],
    ];
    tiles.forEach(([label, rate, hint], i) => {
      const x = L + i * (tileW + 12);
      doc.roundedRect(x, y, tileW, 74, 10).lineWidth(1).fillAndStroke('#FFFFFF', LINE);
      doc.roundedRect(x, y, tileW, 5, 2).fill(i === 1 ? NAVY : TEAL);
      doc.font('Helvetica-Bold').fontSize(26).fillColor(i === 1 ? NAVY : TEAL).text(`${rate}%`, x, y + 14, { width: tileW, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(label, x, y + 45, { width: tileW, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor(GREY).text(hint, x + 6, y + 58, { width: tileW - 12, align: 'center' });
    });
    y += 86;
    doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(
      `Applies to bookings made on or after ${mouDate(d.effectiveFrom)}, once the Partner has accepted this MOU.`,
      L,
      y,
      { width: W, align: 'center' },
    );
    y = doc.y + 18;

    // ---------------------------------------------------------------- terms
    heading('Terms & conditions');
    doc.y = y;
    for (const para of pdfText(d.terms).split(/\n\s*\n/)) {
      const text = para.replace(/\s*\n\s*/g, ' ').trim();
      if (!text) continue;
      // "1. Purpose. Rest of the clause" → number + title in brand colour, the rest in ink.
      const m = /^(\d+\.)\s+([^.]{2,60}\.)\s+(.*)$/.exec(text);
      if (doc.y > doc.page.height - 110) doc.addPage();
      if (m) {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEAL).text(`${m[1]} `, L, doc.y, { continued: true, width: W, align: 'justify', lineGap: 1.8 });
        doc.fillColor(NAVY).text(`${m[2]} `, { continued: true });
        doc.font('Helvetica').fillColor(INK).text(m[3]!);
      } else {
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(text, L, doc.y, { width: W, align: 'justify', lineGap: 1.8 });
      }
      doc.moveDown(0.6);
    }

    // ---------------------------------------------------------------- signatures (kept together)
    const sigBlockH = 250 + (d.verifiedAt ? 40 : 0);
    if (doc.y > doc.page.height - 56 - sigBlockH) doc.addPage();
    y = doc.y + 10;
    heading('Signatures');
    doc.font('Helvetica').fontSize(9).fillColor(GREY).text('Agreed and signed by both parties:', L, y - 4, { width: W });
    y = doc.y + 8;
    const cs = d.companySignatory;
    const sigCard = (x: number, label: string, name: string, filled?: { image: string | null; name: string | null; designation: string | null; date: string }) => {
      const top = y;
      doc.roundedRect(x, top, colW, 220, 10).lineWidth(1).fillAndStroke('#FFFFFF', LINE);
      doc.roundedRect(x, top, colW, 26, 10).fill(SOFT);
      doc.rect(x, top + 16, colW, 10).fill(SOFT);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(label, x + 14, top + 9, { width: colW - 28 });
      doc.font('Helvetica').fontSize(8).fillColor(GREY).text(pdfText(name), x + 14, top + 32, { width: colW - 28 });
      const rows = ['Signature', 'Name', 'Designation', 'Stamp / seal', 'Date', 'Place'];
      const values: Record<string, string | null> = filled ? { Name: filled.name, Designation: filled.designation, Date: filled.date } : {};
      rows.forEach((r, i) => {
        const ly = top + 72 + i * 24;
        doc.moveTo(x + 84, ly + 9).lineTo(x + colW - 14, ly + 9).lineWidth(0.6).strokeColor(LINE).stroke();
        doc.font('Helvetica').fontSize(8).fillColor(GREY).text(r, x + 14, ly, { width: 68 });
        const v = values[r];
        if (v) doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(pdfText(v), x + 88, ly - 1, { width: colW - 104, lineBreak: false });
      });
      if (filled?.image) {
        try {
          doc.image(filled.image, x + 88, top + 30, { fit: [colW - 104, 50], valign: 'bottom' });
        } catch {
          // An unreadable image leaves the line blank rather than failing the whole document.
        }
      }
    };
    sigCard(L, `For ${d.company.name}`, cs?.designation ?? 'Authorised signatory', cs && (cs.imagePath || cs.name) ? { image: cs.imagePath, name: cs.name, designation: cs.designation, date: mouDate(d.issuedOn) } : undefined);
    const ao = d.acceptedOnline;
    sigCard(L + colW + 14, 'Partner', d.partner.name, ao ? { image: null, name: d.partner.name, designation: null, date: mouDate(ao.at) } : undefined);
    if (ao) {
      // In place of a handwritten signature: the online acceptance.
      const sx = L + colW + 14 + 88;
      doc.roundedRect(sx, y + 34, colW - 104, 40, 6).fill('#E7F5EC');
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GREEN).text('ACCEPTED ONLINE (OTP)', sx + 8, y + 40, { width: colW - 120 });
      doc.font('Helvetica').fontSize(7.5).fillColor(INK).text(`OTP to ${ao.phoneMasked} · ${istDateTime(ao.at)}`, sx + 8, y + 53, { width: colW - 120 });
    }
    y += 232;

    if (ao) {
      doc.roundedRect(L, y, W, 28, 8).fill('#E7F5EC');
      doc.roundedRect(L, y, 4, 28, 2).fill(GREEN);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN).text(
        `ACCEPTED ONLINE by ${pdfText(d.partner.name)} on ${istDateTime(ao.at)} with an OTP sent to ${ao.phoneMasked} — rates apply from ${mouDate(ao.at > d.effectiveFrom ? ao.at : d.effectiveFrom)}.`,
        L + 14,
        y + 9.5,
        { width: W - 28, align: 'center' },
      );
    } else if (d.verifiedAt) {
      doc.roundedRect(L, y, W, 28, 8).fill('#E7F5EC');
      doc.roundedRect(L, y, 4, 28, 2).fill(GREEN);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN).text(
        `VERIFIED by ${d.company.name} on ${mouDate(d.verifiedAt)} — the commission rates in this MOU apply from ${mouDate(d.verifiedAt > d.effectiveFrom ? d.verifiedAt : d.effectiveFrom)}.`,
        L + 14,
        y + 9.5,
        { width: W - 28, align: 'center' },
      );
    }

    // ---------------------------------------------------------------- watermark + footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Writing inside the bottom margin would otherwise start a new page.
      doc.page.margins.bottom = 0;
      if (hasLogo) {
        doc.save();
        doc.opacity(0.045);
        doc.image(LOGO, pageW / 2 - 150, doc.page.height / 2 - 120, { width: 300 });
        doc.restore();
      }
      const fy = doc.page.height - 38;
      doc.moveTo(L, fy - 8).lineTo(L + W, fy - 8).lineWidth(0.8).strokeColor(TEAL).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor(GREY);
      doc.text(`${d.company.name}  ·  MOU ${d.mouNumber}  ·  ${d.status}`, L, fy, { width: W / 2, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, L + W / 2, fy, { width: W / 2, align: 'right', lineBreak: false });
      doc.rect(0, doc.page.height - 6, pageW, 6).fill(TEAL_DEEP);
    }
    doc.end();
  });
}
