export type TomlPrimitive = string | boolean | number;

export function setTopLevelValue(content: string, key: string, value: TomlPrimitive): string {
  const lines = splitLines(content);
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  const firstSectionIndex = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
  const searchEnd = firstSectionIndex >= 0 ? firstSectionIndex : lines.length;

  for (let index = 0; index < searchEnd; index += 1) {
    if (keyPattern.test(lines[index])) {
      lines[index] = `${key} = ${formatTomlValue(value)}`;
      return joinLines(lines);
    }
  }

  const insertAt = firstSectionIndex >= 0 ? firstSectionIndex : lines.length;
  lines.splice(insertAt, 0, `${key} = ${formatTomlValue(value)}`);
  return joinLines(lines);
}

export function getTopLevelStringValue(content: string, key: string): string | undefined {
  const lines = splitLines(content);
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.+?)\\s*$`);
  const firstSectionIndex = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
  const searchEnd = firstSectionIndex >= 0 ? firstSectionIndex : lines.length;

  for (let index = 0; index < searchEnd; index += 1) {
    const match = lines[index].match(keyPattern);
    if (match) {
      return parseTomlString(match[1]);
    }
  }
  return undefined;
}

export function setSectionValue(content: string, section: string, key: string, value: TomlPrimitive): string {
  let lines = splitLines(content);
  const sectionPattern = new RegExp(`^\\s*\\[${escapeRegExp(section)}\\]\\s*$`);
  const nextSectionPattern = /^\s*\[[^\]]+\]\s*$/;
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  let sectionStart = lines.findIndex((line) => sectionPattern.test(line));

  if (sectionStart < 0) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push(`[${section}]`);
    lines.push(`${key} = ${formatTomlValue(value)}`);
    return joinLines(lines);
  }

  let sectionEnd = lines.length;
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (nextSectionPattern.test(lines[index])) {
      sectionEnd = index;
      break;
    }
  }

  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    if (keyPattern.test(lines[index])) {
      lines[index] = `${key} = ${formatTomlValue(value)}`;
      return joinLines(lines);
    }
  }

  lines.splice(sectionEnd, 0, `${key} = ${formatTomlValue(value)}`);
  return joinLines(lines);
}

function formatTomlValue(value: TomlPrimitive): string {
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return String(value);
}

function parseTomlString(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed && !trimmed.includes('#')) {
    return trimmed;
  }
  return undefined;
}

function splitLines(content: string): string[] {
  if (!content) {
    return [];
  }
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '').split('\n');
}

function joinLines(lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
