import { createHmac, timingSafeEqual } from 'crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { Observable, map } from 'rxjs';

// Lab reports and prescriptions are medical documents. Their files are not served to anyone who merely knows
// (or guesses, or is forwarded) the path: every API response that mentions one carries a link signed for that
// exact path with an expiry, and the file server refuses anything else. Because the signing happens on the way
// OUT of the API, the website and the apps keep using the `fileUrl` they already receive — nothing changes for
// them, and a person only ever gets a link for a document the API already let them see.
const PROTECTED_PREFIXES = ['/uploads/reports/', '/uploads/prescriptions/'];
const LINK_LIFETIME_SECONDS = 60 * 60;

function secretOf(config: ConfigService): string {
  return config.get<string>('JWT_SECRET') ?? '';
}

function signature(secret: string, path: string, expires: number): string {
  return createHmac('sha256', secret).update(path + '|' + expires).digest('hex');
}

function isProtectedPath(value: string): boolean {
  return PROTECTED_PREFIXES.some((p) => value.startsWith(p)) && !value.includes('?');
}

export function signUploadUrl(secret: string, path: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + LINK_LIFETIME_SECONDS;
  return path + '?e=' + expires + '&s=' + signature(secret, path, expires);
}

/** Copies only what has to change — cached or shared objects are never modified. */
function signDeep(secret: string, value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return isProtectedPath(value) ? signUploadUrl(secret, value) : value;
  if (value === null || typeof value !== 'object' || depth > 12) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const n = signDeep(secret, v, depth + 1);
      if (n !== v) changed = true;
      return n;
    });
    return changed ? out : value;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // Dates, Buffers, streams, class instances
  const record = value as Record<string, unknown>;
  let out: Record<string, unknown> | null = null;
  for (const key of Object.keys(record)) {
    const n = signDeep(secret, record[key], depth + 1);
    if (n !== record[key]) {
      out ??= { ...record };
      out[key] = n;
    }
  }
  return out ?? value;
}

@Injectable()
export class SignUploadUrlsInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const secret = secretOf(this.config);
    if (!secret) return next.handle();
    return next.handle().pipe(map((body) => signDeep(secret, body)));
  }
}

/** Express middleware for the file server: a protected document needs a valid, unexpired signature for its own path. */
export function requireSignedUploadUrl(config: ConfigService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = decodeURIComponent(req.path.startsWith('/uploads') ? req.path : req.baseUrl + req.path);
    if (!PROTECTED_PREFIXES.some((p) => path.startsWith(p))) return next();

    const secret = secretOf(config);
    const expires = Number(req.query['e']);
    const given = typeof req.query['s'] === 'string' ? (req.query['s'] as string) : '';
    if (secret && Number.isFinite(expires) && expires * 1000 > Date.now() && given.length > 0) {
      const expected = Buffer.from(signature(secret, path, expires));
      const actual = Buffer.from(given);
      if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
        res.setHeader('Cache-Control', 'private, no-store');
        return next();
      }
    }
    res.status(403).json({ statusCode: 403, message: 'This link has expired or is not valid — open the document again from your account.' });
  };
}
