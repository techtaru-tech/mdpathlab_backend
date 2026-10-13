import type { DevicePlatform, NotificationApp, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Saves a device's push token for one user and one app. A token is unique, so saving it moves it away from
 * whoever had it before: when a different account logs in on the same phone, the old account stops getting pushes
 * on that phone. Used by login (fcmToken on OTP verify) and by the device-token endpoints.
 */
export async function saveDeviceToken(db: Db, userId: string, app: NotificationApp, token: string, platform?: DevicePlatform | null) {
  const now = new Date();
  await db.deviceToken.upsert({
    where: { token },
    create: { token, userId, app, platform: platform ?? 'WEB', lastSeenAt: now },
    update: { userId, adminUserId: null, app, ...(platform ? { platform } : {}), lastSeenAt: now },
  });
}

/** Removes a token only if it belongs to this user (logout). Returns how many were removed (0 or 1). */
export async function removeOwnDeviceToken(db: Db, userId: string, token: string) {
  const r = await db.deviceToken.deleteMany({ where: { token, userId } });
  return r.count;
}

/** Every token of a user (optionally only one app's) — used when an account is blocked. */
export async function removeAllDeviceTokens(db: Db, userId: string, app?: NotificationApp) {
  await db.deviceToken.deleteMany({ where: { userId, ...(app ? { app } : {}) } });
}

/** Last 6 characters only — enough to match a log line to a device, never the usable token. */
export const maskToken = (token: string) => '…' + token.slice(-6);
