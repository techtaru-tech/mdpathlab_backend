import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { maskToken } from './device-token-store.js';

/**
 * Wraps firebase-admin's messaging client. Credentials are a service account JSON file, path
 * given by FIREBASE_SERVICE_ACCOUNT_PATH (default ./firebase-service-account.json, gitignored —
 * same reason as any other secret file in this repo). Until that file exists, every send is a
 * silent no-op with a one-time warning log — this lets the rest of the app (and its callers, e.g.
 * OrdersService) develop and deploy independently of whether push notifications are configured
 * yet, rather than crashing NestJS's bootstrap on missing credentials.
 */
@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;
  private warned = false;

  constructor(private readonly config: ConfigService) {
    this.tryInit();
  }

  private tryInit() {
    const path = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH') ?? join(process.cwd(), 'firebase-service-account.json');
    if (!existsSync(path)) return;

    try {
      const serviceAccount = JSON.parse(readFileSync(path, 'utf-8'));
      this.app = initializeApp({ credential: cert(serviceAccount) });
      this.logger.log('Firebase Admin initialized — push notifications are live');
    } catch (err) {
      this.logger.error(`Failed to initialize Firebase Admin from ${path}: ${(err as Error).message}`);
    }
  }

  get isConfigured() {
    return this.app !== null;
  }

  /**
   * Sends the same notification to every token in the list, tolerating individual failures.
   * Returns the subset of tokens that are dead (invalid/unregistered) so the caller can remove
   * them — a token going stale (uninstall, permission revoked, browser data cleared) is the
   * expected steady-state failure mode, not an error worth logging loudly.
   */
  async sendToTokens(tokens: string[], notification: { title: string; body: string; data?: Record<string, string> }): Promise<string[]> {
    if (!this.app || tokens.length === 0) {
      if (!this.app && !this.warned) {
        this.warned = true;
        this.logger.warn('Firebase Admin is not configured — notifications are being dropped. See FIREBASE_SERVICE_ACCOUNT_PATH.');
      }
      return [];
    }

    const deadTokens: string[] = [];
    // FCM takes at most 500 tokens per multicast.
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const res = await getMessaging(this.app).sendEachForMulticast({
        tokens: batch,
        notification: { title: notification.title, body: notification.body },
        data: notification.data,
        android: { notification: { channelId: 'updates' } },
        webpush: { fcmOptions: { link: '/' } },
      });
      res.responses.forEach((r, j) => {
        if (r.success) return;
        const code = r.error?.code ?? '';
        const token = batch[j]!;
        // The token is gone (app uninstalled, data cleared) or was never valid: remove it.
        const dead =
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered' ||
          (code === 'messaging/invalid-argument' && /token/i.test(r.error?.message ?? ''));
        if (dead) deadTokens.push(token);
        else this.logger.warn(`Push send failed for token ${maskToken(token)}: ${code} ${r.error?.message ?? ''}`);
      });
    }
    return deadTokens;
  }
}
