import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { discardUpload, resolveUploadType, RESUME_EXTENSIONS } from '../common/upload-safety.js';
import { CareersService, type CareersScope } from './careers.service.js';
import { ApplyJobDto, UpdateApplicationStatusDto, UpsertJobOpeningDto } from './dto/careers.dto.js';

const RESUME_DIR = join(process.cwd(), 'uploads', 'resumes');
mkdirSync(RESUME_DIR, { recursive: true });
const resumeStorage = diskStorage({
  destination: RESUME_DIR,
  filename: (_req, _file, cb) => cb(null, randomUUID() + '.bin'),
});

// Public Careers page: open roles from MD Path Labs and partner labs, and the application form.
@Controller('careers')
export class CareersController {
  constructor(private readonly careers: CareersService) {}

  @Get('jobs')
  list() {
    return this.careers.listOpen();
  }

  @Get('jobs/:slug')
  get(@Param('slug') slug: string) {
    return this.careers.getOpen(slug);
  }

  // multipart/form-data: name, phone, email?, city?, experience?, message?, and an optional `resume` file
  // (PDF or Word, up to 5 MB). Résumé links are signed like prescriptions — never public.
  @Post('jobs/:slug/apply')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('resume', { storage: resumeStorage, limits: { fileSize: 5 * 1024 * 1024 } }))
  async apply(@Param('slug') slug: string, @Body() dto: ApplyJobDto, @UploadedFile() resume?: Express.Multer.File) {
    let resumeUrl: string | null = null;
    if (resume) {
      const real = await resolveUploadType(resume, RESUME_EXTENSIONS);
      if (!real) throw new BadRequestException('Résumé must be a PDF or Word document');
      resumeUrl = `/uploads/resumes/${real.filename}`;
      resume.path = real.path;
    }
    try {
      return await this.careers.apply(slug, dto, resumeUrl);
    } catch (err) {
      await discardUpload(resume?.path);
      throw err;
    }
  }
}

// The admin manages every opening (MD Path Labs' own and any lab's) and sees all applications.
@Controller('admin/careers')
@UseGuards(AdminAuthGuard)
export class AdminCareersController {
  private readonly scope: CareersScope = { kind: 'admin' };
  constructor(private readonly careers: CareersService) {}

  @Get('jobs')
  list() {
    return this.careers.listManaged(this.scope);
  }

  @Post('jobs')
  create(@Body() dto: UpsertJobOpeningDto) {
    return this.careers.create(this.scope, dto);
  }

  @Patch('jobs/:id')
  update(@Param('id') id: string, @Body() dto: UpsertJobOpeningDto) {
    return this.careers.update(this.scope, id, dto);
  }

  @Delete('jobs/:id')
  remove(@Param('id') id: string) {
    return this.careers.remove(this.scope, id);
  }

  @Get('applications')
  applications(@Query('jobId') jobId?: string) {
    return this.careers.listApplications(this.scope, jobId);
  }

  @Patch('applications/:id')
  setStatus(@Param('id') id: string, @Body() dto: UpdateApplicationStatusDto) {
    return this.careers.setApplicationStatus(this.scope, id, dto.status);
  }
}

// A partner lab posts openings for its own staff and sees only the applications to those.
@Controller('lab/careers')
@UseGuards(LabAuthGuard)
export class LabCareersController {
  constructor(private readonly careers: CareersService) {}

  private scope(req: any): CareersScope {
    return { kind: 'lab', labId: req.lab.labId };
  }

  @Get('jobs')
  list(@Req() req: any) {
    return this.careers.listManaged(this.scope(req));
  }

  @Post('jobs')
  create(@Req() req: any, @Body() dto: UpsertJobOpeningDto) {
    return this.careers.create(this.scope(req), dto);
  }

  @Patch('jobs/:id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpsertJobOpeningDto) {
    return this.careers.update(this.scope(req), id, dto);
  }

  @Delete('jobs/:id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.careers.remove(this.scope(req), id);
  }

  @Get('applications')
  applications(@Req() req: any, @Query('jobId') jobId?: string) {
    return this.careers.listApplications(this.scope(req), jobId);
  }

  @Patch('applications/:id')
  setStatus(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateApplicationStatusDto) {
    return this.careers.setApplicationStatus(this.scope(req), id, dto.status);
  }
}
