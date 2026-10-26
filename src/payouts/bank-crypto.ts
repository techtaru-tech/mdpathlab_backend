import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Bank account numbers are stored encrypted (AES-256-GCM) and only ever shown to the partner as the last 4 digits.
 * Key: BANK_DETAILS_KEY if set (recommended in production), otherwise one derived from JWT_SECRET with HKDF — so
 * it works without a new setting. The ciphertext records which key it used ("k" / "j"), so adding BANK_DETAILS_KEY
 * later doesn't make existing rows unreadable.
 */
@Injectable()
export class BankCrypto {
  constructor(private readonly config: ConfigService) {}

  private key(kind: 'k' | 'j'): Buffer {
    if (kind === 'k') {
      const dedicated = this.config.get<string>('BANK_DETAILS_KEY');
      if (!dedicated) throw new Error('BANK_DETAILS_KEY is not set');
      return createHash('sha256').update(dedicated).digest();
    }
    const jwt = this.config.get<string>('JWT_SECRET');
    if (!jwt) throw new Error('JWT_SECRET is not set');
    return Buffer.from(hkdfSync('sha256', jwt, 'mdpathlab', 'partner-bank-details-v1', 32));
  }

  encrypt(plain: string): string {
    const kind = this.config.get<string>('BANK_DETAILS_KEY') ? 'k' : 'j';
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(kind), iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', kind, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
  }

  decrypt(stored: string): string {
    const [v, kind, iv, tag, ct] = stored.split('.');
    if (v !== 'v1' || (kind !== 'k' && kind !== 'j') || !iv || !tag || !ct) throw new Error('Unrecognised encrypted value');
    const decipher = createDecipheriv('aes-256-gcm', this.key(kind), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
  }
}
