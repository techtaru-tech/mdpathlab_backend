import { randomUUID } from 'crypto';
import { join } from 'path';
import { createWriteStream } from 'fs';
import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveOrderParameterIds } from '../common/resolve-order-parameters.js';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'reports');

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function calculateAge(dob: Date | null): number | null {
  if (!dob) return null;
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Best-effort High/Low flag — only when the reference range is a plain "X - Y" numeric range
 * and the entered value itself parses as a number. Many real parameters have qualitative ranges
 * ("Negative", "Male: 13-17, Female: 12-15") that this deliberately leaves unflagged rather than
 * guessing wrong — the printed range is still shown either way for a human to read.
 */
function computeFlag(value: string, referenceRange: string | null): 'H' | 'L' | null {
  if (!referenceRange) return null;
  const match = referenceRange.match(/^\s*([\d.]+)\s*-\s*([\d.]+)/);
  const numericValue = Number(value);
  if (!match || !Number.isFinite(numericValue)) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (numericValue < low) return 'L';
  if (numericValue > high) return 'H';
  return null;
}

@Injectable()
export class ReportGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds a professional PDF report from the order's LabResultValue entries and saves it under
   * uploads/reports, same as a manually-uploaded report — the caller (AdminReportsController)
   * creates the Report row exactly like it does for an upload, so approval/release/download all
   * go through the one existing path regardless of how the file was produced.
   */
  async generate(orderId: string): Promise<{ fileUrl: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: { include: { familyMember: true } },
        lab: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const [parameterIds, values, settings] = await Promise.all([
      resolveOrderParameterIds(this.prisma, orderId),
      this.prisma.labResultValue.findMany({ where: { orderId } }),
      this.prisma.siteSetting.findFirst(),
    ]);
    if (parameterIds.size === 0) {
      throw new NotFoundException('This booking has no test parameters to report on');
    }

    const parameters = await this.prisma.parameter.findMany({ where: { id: { in: Array.from(parameterIds) } }, orderBy: { name: 'asc' } });
    const valueByParameter = new Map(values.map((v) => [v.parameterId, v]));
    const missing = parameters.filter((p) => !valueByParameter.get(p.id)?.value);
    if (missing.length > 0) {
      throw new NotFoundException(`Missing result values for: ${missing.map((p) => p.name).join(', ')}`);
    }

    // The patient a booking is for — the first item's family member if one was picked, else the
    // account holder themselves. A single order mixing multiple family members' items is an edge
    // case this report (like the rest of the fulfillment flow) treats as one patient.
    const familyMember = order.items.find((i) => i.familyMember)?.familyMember ?? null;
    const patientName = familyMember?.name ?? order.user.name ?? 'Patient';
    const patientGender = familyMember?.gender ?? order.user.gender ?? null;
    const patientAge = familyMember?.age ?? calculateAge(familyMember?.dob ?? order.user.dob);

    const labName = order.lab?.name ?? 'MD Path Lab';
    const labAddress = order.lab?.address ?? settings?.address ?? null;
    const labAccreditation = order.lab?.accreditationNumber ?? null;
    const labPhone = settings?.phone ?? null;
    const pathologistName = order.lab?.pathologistName ?? null;
    const pathologistQualification = order.lab?.pathologistQualification ?? null;
    const processedByLabName = order.lab?.name ?? null;

    const fileName = `${randomUUID()}.pdf`;
    const filePath = join(UPLOAD_DIR, fileName);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);

      // ---------- Letterhead ----------
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#265464').text(labName, { align: 'left' });
      doc.fontSize(9).font('Helvetica').fillColor('#5F6A77');
      if (labAddress) doc.text(labAddress);
      const contactLine = [labPhone, labAccreditation ? `Accreditation: ${labAccreditation}` : null].filter(Boolean).join('   ·   ');
      if (contactLine) doc.text(contactLine);

      doc.moveDown(0.5);
      doc.strokeColor('#38768C').lineWidth(1.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.8);

      doc.fontSize(13).font('Helvetica-Bold').fillColor('#11212C').text('DIAGNOSTIC TEST REPORT', { align: 'center' });
      doc.moveDown(1);

      // ---------- Patient info ----------
      const infoLeftX = 40;
      const infoRightX = 300;
      const infoTop = doc.y;

      function infoRow(y: number, label: string, value: string, x: number) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#5F6A77').text(label.toUpperCase(), x, y);
        doc.fontSize(10).font('Helvetica').fillColor('#11212C').text(value, x, y + 12);
      }

      infoRow(infoTop, 'Patient Name', patientName, infoLeftX);
      infoRow(infoTop, 'Booking ID', order.orderNumber, infoRightX);
      infoRow(infoTop + 34, 'Age / Gender', `${patientAge ?? '—'} yrs / ${patientGender ?? '—'}`, infoLeftX);
      infoRow(infoTop + 34, 'Collection Date', formatDate(order.scheduledDate), infoRightX);
      infoRow(infoTop + 68, 'Referred By', 'Self', infoLeftX);
      infoRow(infoTop + 68, 'Report Date', formatDate(new Date()), infoRightX);

      doc.y = infoTop + 100;
      doc.strokeColor('#DFE5E8').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(1);

      // ---------- Results table ----------
      const colTest = 40;
      const colResult = 280;
      const colUnit = 370;
      const colRange = 440;
      const tableTop = doc.y;

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.rect(40, tableTop, 515, 22).fill('#265464');
      doc.fillColor('#FFFFFF');
      doc.text('TEST NAME', colTest + 8, tableTop + 6);
      doc.text('RESULT', colResult, tableTop + 6);
      doc.text('UNIT', colUnit, tableTop + 6);
      doc.text('REFERENCE RANGE', colRange, tableTop + 6);

      let y = tableTop + 22;
      parameters.forEach((param, i) => {
        const entry = valueByParameter.get(param.id);
        const value = entry?.value ?? '—';
        const unit = entry?.unit ?? '';
        const flag = computeFlag(value, param.referenceRange);
        const rowHeight = 22;

        if (i % 2 === 1) {
          doc.rect(40, y, 515, rowHeight).fill('#F2F7F9');
        }

        doc.fontSize(9).font('Helvetica').fillColor('#11212C');
        doc.text(param.name, colTest + 8, y + 6, { width: 230 });
        doc.font(flag ? 'Helvetica-Bold' : 'Helvetica').fillColor(flag === 'H' ? '#E40A06' : flag === 'L' ? '#38768C' : '#11212C');
        doc.text(`${value}${flag ? ` ${flag}` : ''}`, colResult, y + 6);
        doc.font('Helvetica').fillColor('#11212C');
        doc.text(unit, colUnit, y + 6);
        doc.fontSize(8).fillColor('#5F6A77').text(param.referenceRange ?? '—', colRange, y + 6, { width: 105 });

        y += rowHeight;
        if (y > 740) {
          doc.addPage();
          y = 40;
        }
      });

      doc.y = y + 20;

      // ---------- Sign-off ----------
      doc.strokeColor('#DFE5E8').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(1.5);
      if (pathologistName) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#11212C').text(pathologistName, 350, doc.y, { width: 205, align: 'right' });
        if (pathologistQualification) {
          doc.fontSize(8).font('Helvetica').fillColor('#5F6A77').text(pathologistQualification, 350, doc.y + 2, { width: 205, align: 'right' });
        }
        doc.fontSize(8).fillColor('#5F6A77').text('Reviewed & Verified', 350, doc.y + 2, { width: 205, align: 'right' });
      }
      doc.moveDown(2);

      doc.fontSize(7).fillColor('#5F6A77').text(
        `This is a computer-generated report${processedByLabName ? `, processed at ${processedByLabName}` : ''} and does not require a physical signature. Results should be correlated clinically.`,
        40,
        doc.y,
        { width: 515, align: 'center' },
      );

      doc.end();
    });

    return { fileUrl: `/uploads/reports/${fileName}` };
  }
}
