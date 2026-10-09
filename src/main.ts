import { mkdirSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { requireSignedUploadUrl } from './common/signed-upload-urls';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true — needed to verify the Razorpay webhook's HMAC signature against the exact
  // bytes received, before any JSON re-serialization could change them.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Behind Apache every request arrives from the proxy. Without this the rate limiter sees one address for all
  // visitors (one person could lock everyone out of login); with it, req.ip is the real client from the proxy's
  // X-Forwarded-For (one trusted hop).
  app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.enableCors({
    origin: [
      'http://localhost:8080',
      'https://xdm5v3xw-8080.asse.devtunnels.ms',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Interim local disk storage for report PDFs — until real cloud storage (S3-compatible per
  // the dev plan) is configured, uploaded reports live here and are served statically.
  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(join(uploadsDir, 'reports'), { recursive: true });
  mkdirSync(join(uploadsDir, 'offers'), { recursive: true });
  // Reports and prescriptions are only served with a signature the API put on the link (see signed-upload-urls.ts).
  app.use('/uploads', requireSignedUploadUrl(app.get(ConfigService)));
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads',
    // Uploaded files are data, never pages: no MIME sniffing, no scripts if one is opened directly, and anything
    // that could render as a page is forced to download. (PDFs skip the sandbox header — it blanks Chrome's viewer.)
    setHeaders: (res, filePath) => {
      const lower = filePath.toLowerCase();
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (!lower.endsWith('.pdf')) {
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
      }
      if (/\.(html?|xhtml|xml|js|mjs)$/.test(lower)) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  });

  await app.listen(process.env.PORT ?? 3001);
}

// Node does not exit on an unhandled rejection by default — without this, a bootstrap failure
// (e.g. EADDRINUSE from a port collision on a shared host) leaves the process running with no
// HTTP server at all, indistinguishable from healthy in `pm2 list`, silently serving nothing
// until someone notices. Exiting lets PM2's restart policy actually kick in and surfaces the
// failure in the process manager instead of it going unnoticed.
bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
