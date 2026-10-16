import ExcelJS from 'exceljs';
import type { PrismaService } from '../prisma/prisma.service.js';

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', INACTIVE: 'Inactive', ON_LEAVE: 'On leave' };

/**
 * One lab's phlebotomists as an Excel workbook (.xlsx). Collections and ratings use the same definitions as the
 * dashboards: a completed collection is a HOME booking, not cancelled, handed over to the lab; rating is the
 * average of approved customer reviews on bookings they handled.
 */
export async function buildPhlebotomistsWorkbook(prisma: PrismaService, labId: string): Promise<{ buffer: Buffer; labName: string }> {
  const [lab, phlebotomists] = await Promise.all([
    prisma.lab.findUnique({ where: { id: labId }, select: { name: true } }),
    prisma.phlebotomist.findMany({
      where: { labId },
      include: { user: { select: { name: true, phone: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const ids = phlebotomists.map((p) => p.id);

  const [completed, open, reviews] = await Promise.all([
    prisma.order.groupBy({
      by: ['phlebotomistId'],
      where: { phlebotomistId: { in: ids }, collectionType: 'HOME', status: { not: 'CANCELLED' }, handedOverAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['phlebotomistId'],
      where: { phlebotomistId: { in: ids }, status: { in: ['CONFIRMED', 'PHLEBOTOMIST_ASSIGNED'] }, handedOverAt: null },
      _count: { _all: true },
    }),
    prisma.review.findMany({
      where: { status: 'APPROVED', order: { phlebotomistId: { in: ids } } },
      select: { rating: true, order: { select: { phlebotomistId: true } } },
    }),
  ]);
  const completedBy = new Map(completed.map((c) => [c.phlebotomistId, c._count._all]));
  const openBy = new Map(open.map((c) => [c.phlebotomistId, c._count._all]));
  const ratingsBy = new Map<string, number[]>();
  for (const r of reviews) {
    const id = r.order.phlebotomistId!;
    ratingsBy.set(id, [...(ratingsBy.get(id) ?? []), r.rating]);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MD Path Lab';
  wb.created = new Date();
  const ws = wb.addWorksheet('Phlebotomists', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'S.No', key: 'sno', width: 6 },
    { header: 'Employee code', key: 'code', width: 16 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Mobile', key: 'phone', width: 14 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Status', key: 'status', width: 11 },
    { header: 'Vehicle type', key: 'vehicleType', width: 14 },
    { header: 'Vehicle number', key: 'vehicleNumber', width: 16 },
    { header: 'Coverage city', key: 'coverageCity', width: 16 },
    { header: 'Joined on', key: 'joined', width: 13 },
    { header: 'Completed collections', key: 'completed', width: 12 },
    { header: 'Open bookings', key: 'open', width: 10 },
    { header: 'Rating', key: 'rating', width: 8 },
    { header: 'Reviews', key: 'reviews', width: 9 },
  ];

  phlebotomists.forEach((p, i) => {
    const rs = ratingsBy.get(p.id) ?? [];
    ws.addRow({
      sno: i + 1,
      code: p.employeeCode,
      name: p.user.name ?? '',
      phone: p.user.phone,
      email: p.user.email ?? '',
      status: STATUS_LABEL[p.status] ?? p.status,
      vehicleType: p.vehicleType ?? '',
      vehicleNumber: p.vehicleNumber ?? '',
      coverageCity: p.coverageCity?.trim() ?? '',
      joined: p.createdAt,
      completed: completedBy.get(p.id) ?? 0,
      open: openBy.get(p.id) ?? 0,
      rating: rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 10) / 10 : null,
      reviews: rs.length,
    });
  });

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF38768C' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  ws.getColumn('joined').numFmt = 'dd-mmm-yyyy';
  ws.getColumn('phone').numFmt = '@';
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, labName: lab?.name ?? 'Lab' };
}
