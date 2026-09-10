import { mkdirSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true — needed to verify the Razorpay webhook's HMAC signature against the exact
  // bytes received, before any JSON re-serialization could change them.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

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
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

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
