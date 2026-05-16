import { createHash } from 'crypto';

export function fingerprintSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
