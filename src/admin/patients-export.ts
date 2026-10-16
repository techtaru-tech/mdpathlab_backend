import ExcelJS from 'exceljs';
import type { PrismaService } from '../prisma/prisma.service.js';

const GENDER: Record<string, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' };

function ageFrom(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) years--;
  return years >= 0 ? years : null;
}

/**
 * Every patient as an Excel workbook (.xlsx): contact details, profile, wallet, family size and their bookings —
 * how many, how many completed (report ready), how much they paid, and when they last booked.
 */
export async function buildPatientsWorkbook(prisma: PrismaService): Promise<Buffer> {
  const [patients, orderStats, paid, completed] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'PATIENT' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        gender: true,
        dob: true,
        city: true,
        status: true,
        walletBalance: true,
        createdAt: true,
        _count: { select: { familyMembers: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.order.groupBy({ by: ['userId'], where: { status: { not: 'CANCELLED' } }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.order.groupBy({ by: ['userId'], where: { status: { not: 'CANCELLED' }, paymentStatus: 'PAID' }, _sum: { total: true } }),
    prisma.order.groupBy({ by: ['userId'], where: { status: 'REPORT_READY' }, _count: { _all: true } }),
  ]);
  const statsBy = new Map(orderStats.map((s) => [s.userId, s]));
  const paidBy = new Map(paid.map((s) => [s.userId, s._sum.total ?? 0]));
  const doneBy = new Map(completed.map((s) => [s.userId, s._count._all]));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MD Path Lab';
  wb.created = new Date();
  const ws = wb.addWorksheet('Patients', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'S.No', key: 'sno', width: 6 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Mobile', key: 'phone', width: 14 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Gender', key: 'gender', width: 9 },
    { header: 'Date of birth', key: 'dob', width: 13 },
    { header: 'Age', key: 'age', width: 6 },
    { header: 'City', key: 'city', width: 14 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Registered on', key: 'joined', width: 14 },
    { header: 'Family members', key: 'family', width: 10 },
    { header: 'Bookings', key: 'bookings', width: 10 },
    { header: 'Reports ready', key: 'done', width: 10 },
    { header: 'Total paid (₹)', key: 'paid', width: 12 },
    { header: 'Last booking', key: 'last', width: 13 },
    { header: 'Wallet (₹)', key: 'wallet', width: 10 },
  ];

  patients.forEach((p, i) => {
    const s = statsBy.get(p.id);
    ws.addRow({
      sno: i + 1,
      name: p.name ?? '',
      phone: p.phone,
      email: p.email ?? '',
      gender: p.gender ? GENDER[p.gender] : '',
      dob: p.dob,
      age: ageFrom(p.dob),
      city: p.city?.trim() ?? '',
      status: p.status === 'ACTIVE' ? 'Active' : 'Inactive',
      joined: p.createdAt,
      family: p._count.familyMembers,
      bookings: s?._count._all ?? 0,
      done: doneBy.get(p.id) ?? 0,
      paid: paidBy.get(p.id) ?? 0,
      last: s?._max.createdAt ?? null,
      wallet: p.walletBalance,
    });
  });

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF38768C' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  for (const key of ['dob', 'joined', 'last']) ws.getColumn(key).numFmt = 'dd-mmm-yyyy';
  ws.getColumn('phone').numFmt = '@';
  for (const key of ['paid', 'wallet']) ws.getColumn(key).numFmt = '#,##0';
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
