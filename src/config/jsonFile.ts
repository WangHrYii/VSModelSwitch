import * as fs from 'fs/promises';
import { atomicWrite, pathExists } from './atomicWrite';

export async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  if (!(await pathExists(filePath))) {
    return {};
  }

  const content = await fs.readFile(filePath, 'utf8');
  if (!content.trim()) {
    return {};
  }

  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

export async function writeJsonObject(filePath: string, value: Record<string, unknown>): Promise<void> {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
