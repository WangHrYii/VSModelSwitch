import { randomUUID } from 'crypto';

export function createId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'provider';
}
