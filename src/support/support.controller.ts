import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

// Public, read-only content for the customer app (no login needed): About Us / Privacy Policy / Terms pages and
// the Help & Support screen. All of it is admin-managed — page text in Admin → Settings, FAQs in Admin → FAQ —
// and is the same content the website and the phlebotomist app show.
@Controller('support')
export class SupportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // FAQ feed, grouped by `topic` client-side (same "one flat list, group by a field" convention as
  // /catalogue/categories' tests-by-tag).
  @Get('faq')
  listFaq() {
    return this.prisma.faq.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ topic: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  /** About Us, Privacy Policy and Terms & Conditions — plain text, paragraphs separated by a blank line. */
  @Get('pages')
  async pages() {
    const s = await this.settings.getOrCreate();
    return {
      aboutUs: s.aboutUsContent ?? '',
      privacyPolicy: s.privacyPolicyContent ?? '',
      termsConditions: s.termsConditionsContent ?? '',
    };
  }

  /** Help & Support screen in one call: how to reach the lab, plus the FAQs. */
  @Get('help')
  async help() {
    const [s, faqs] = await Promise.all([
      this.settings.getOrCreate(),
      this.prisma.faq.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ topic: 'asc' }, { sortOrder: 'asc' }] }),
    ]);
    return {
      contact: { phone: s.phone, email: s.email, address: s.address },
      faqs: faqs.map((f) => ({ id: f.id, topic: f.topic, question: f.question, answer: f.answer })),
    };
  }
}
