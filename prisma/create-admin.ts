// One-off: ensure an AdminUser row exists, without touching anything else (catalogue, orders,
// etc). Safe to run any number of times — never overwrites an existing admin's password.
// Usage: npx tsx prisma/create-admin.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@mdpathlabs.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${existing.email} (id ${existing.id}) — leaving password untouched.`);
    return;
  }

  const created = await prisma.adminUser.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10), name: 'Admin' },
  });
  console.log(`Created admin: ${created.email} / password: ${password} — please log in and change it.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
