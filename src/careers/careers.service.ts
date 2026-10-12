import { randomBytes } from 'crypto';
import { join } from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { slugify } from '../common/slugify.js';
import { discardUpload } from '../common/upload-safety.js';
import type { ApplyJobDto, UpsertJobOpeningDto } from './dto/careers.dto.js';

/**
 * Who is managing openings: the admin manages every opening (MD Path Labs' own and any lab's); a lab only ever
 * sees and changes the openings it posted, and only the applications to those.
 */
export type CareersScope = { kind: 'admin' } | { kind: 'lab'; labId: string };

const publicSelect = {
  id: true,
  slug: true,
  title: true,
  department: true,
  location: true,
  employmentType: true,
  experience: true,
  salary: true,
  openings: true,
  description: true,
  requirements: true,
  createdAt: true,
  lab: { select: { name: true } },
} satisfies Prisma.JobOpeningSelect;

const managedInclude = {
  lab: { select: { id: true, name: true } },
  _count: { select: { applications: true } },
} satisfies Prisma.JobOpeningInclude;

const applicationInclude = {
  job: { select: { id: true, title: true, location: true, lab: { select: { name: true } } } },
} satisfies Prisma.JobApplicationInclude;

// Open roles only; a deactivated lab's openings disappear with it.
const VISIBLE: Prisma.JobOpeningWhereInput = {
  status: 'OPEN',
  OR: [{ labId: null }, { lab: { status: 'ACTIVE' } }],
};

@Injectable()
export class CareersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- public ----------

  async listOpen() {
    const jobs = await this.prisma.jobOpening.findMany({ where: VISIBLE, orderBy: { createdAt: 'desc' }, select: publicSelect });
    return jobs.map(toPublic);
  }

  async getOpen(slugOrId: string) {
    const job = await this.prisma.jobOpening.findFirst({
      where: { AND: [VISIBLE, { OR: [{ slug: slugOrId }, { id: slugOrId }] }] },
      select: publicSelect,
    });
    if (!job) throw new NotFoundException('This opening is closed or no longer available');
    return toPublic(job);
  }

  async apply(slugOrId: string, dto: ApplyJobDto, resumeUrl: string | null) {
    const job = await this.getOpen(slugOrId);
    const application = await this.prisma.jobApplication.create({
      data: {
        jobId: job.id,
        name: dto.name.trim(),
        phone: dto.phone,
        email: dto.email?.trim() || null,
        city: dto.city?.trim() || null,
        experience: dto.experience?.trim() || null,
        message: dto.message?.trim() || null,
        resumeUrl,
      },
    });
    await this.notifications.notifyAdmins({
      title: 'New job application',
      body: `${application.name} applied for ${job.title} (${job.postedBy})`,
      data: { type: 'JOB_APPLICATION', applicationId: application.id, jobId: job.id },
    });
    return {
      id: application.id,
      jobTitle: job.title,
      message: 'Application received. The hiring team will contact you if your profile is shortlisted.',
    };
  }

  // ---------- admin / lab ----------

  private ownerWhere(scope: CareersScope): Prisma.JobOpeningWhereInput {
    return scope.kind === 'lab' ? { labId: scope.labId } : {};
  }

  listManaged(scope: CareersScope) {
    return this.prisma.jobOpening.findMany({ where: this.ownerWhere(scope), orderBy: { createdAt: 'desc' }, include: managedInclude });
  }

  private async findManaged(scope: CareersScope, id: string) {
    const job = await this.prisma.jobOpening.findFirst({ where: { id, ...this.ownerWhere(scope) } });
    if (!job) throw new NotFoundException('Opening not found');
    return job;
  }

  async create(scope: CareersScope, dto: UpsertJobOpeningDto) {
    if (!dto.title?.trim() || !dto.location?.trim() || !dto.description?.trim()) {
      throw new BadRequestException('Title, location and description are required');
    }
    // The random suffix keeps two "Phlebotomist" openings (or the same title from two labs) from colliding.
    const slug = `${slugify(dto.title) || 'job'}-${randomBytes(3).toString('hex')}`;
    return this.prisma.jobOpening.create({
      data: {
        slug,
        title: dto.title.trim(),
        department: dto.department?.trim() || null,
        location: dto.location.trim(),
        employmentType: dto.employmentType ?? 'FULL_TIME',
        experience: dto.experience?.trim() || null,
        salary: dto.salary?.trim() || null,
        openings: dto.openings ?? 1,
        description: dto.description.trim(),
        requirements: dto.requirements?.trim() || null,
        status: dto.status ?? 'OPEN',
        labId: scope.kind === 'lab' ? scope.labId : null,
      },
      include: managedInclude,
    });
  }

  async update(scope: CareersScope, id: string, dto: UpsertJobOpeningDto) {
    await this.findManaged(scope, id);
    const optionalText = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
    return this.prisma.jobOpening.update({
      where: { id },
      data: {
        ...(dto.title?.trim() ? { title: dto.title.trim() } : {}),
        ...(dto.location?.trim() ? { location: dto.location.trim() } : {}),
        ...(dto.description?.trim() ? { description: dto.description.trim() } : {}),
        ...(dto.employmentType ? { employmentType: dto.employmentType } : {}),
        ...(dto.openings !== undefined ? { openings: dto.openings } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        department: optionalText(dto.department),
        experience: optionalText(dto.experience),
        salary: optionalText(dto.salary),
        requirements: optionalText(dto.requirements),
      },
      include: managedInclude,
    });
  }

  async remove(scope: CareersScope, id: string) {
    await this.findManaged(scope, id);
    const resumes = await this.prisma.jobApplication.findMany({ where: { jobId: id, resumeUrl: { not: null } }, select: { resumeUrl: true } });
    await this.prisma.jobOpening.delete({ where: { id } });
    // Applications go with the opening (cascade); their résumé files are personal data, so they go too.
    await Promise.all(resumes.map((r) => discardUpload(join(process.cwd(), r.resumeUrl!))));
    return { deleted: true };
  }

  listApplications(scope: CareersScope, jobId?: string) {
    return this.prisma.jobApplication.findMany({
      where: { ...(jobId ? { jobId } : {}), job: this.ownerWhere(scope) },
      orderBy: { createdAt: 'desc' },
      include: applicationInclude,
    });
  }

  async setApplicationStatus(scope: CareersScope, id: string, status: 'NEW' | 'SHORTLISTED' | 'REJECTED' | 'HIRED') {
    const application = await this.prisma.jobApplication.findFirst({ where: { id, job: this.ownerWhere(scope) } });
    if (!application) throw new NotFoundException('Application not found');
    return this.prisma.jobApplication.update({ where: { id }, data: { status }, include: applicationInclude });
  }
}

function toPublic(job: Prisma.JobOpeningGetPayload<{ select: typeof publicSelect }>) {
  const { lab, ...rest } = job;
  return { ...rest, postedBy: lab?.name ?? 'MD Path Labs' };
}
