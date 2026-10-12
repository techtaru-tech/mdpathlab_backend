import { CanActivate, ExecutionContext, HttpException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const LIMIT_KEY = 'perUserRateLimit';

/** Rate limit per signed-in patient: `limit` calls per `windowMs`, counted by the verified token's user. */
export const PerUserRateLimit = (limit: number, windowMs: number) => SetMetadata(LIMIT_KEY, { limit, windowMs });

/**
 * Counts per user, not per IP — many customers can share one IP (an office, a mobile carrier), and the
 * checkout limits are about one person retrying. Must run after JwtAuthGuard so req.user is the verified token.
 * In memory: the API runs as a single process.
 */
@Injectable()
export class UserThrottlerGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.get<{ limit: number; windowMs: number }>(LIMIT_KEY, context.getHandler());
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.sub;
    if (!rule || !userId) return true;

    const key = `${context.getClass().name}.${context.getHandler().name}:${userId}`;
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);
    if (recent.length >= rule.limit) {
      throw new HttpException({ statusCode: 429, message: 'Too many attempts. Please wait a minute and try again.' }, 429);
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (!v.some((t) => now - t < rule.windowMs)) this.hits.delete(k);
    }
    return true;
  }
}
