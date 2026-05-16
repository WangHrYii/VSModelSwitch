export function redactSecret(value: string | undefined): string {
  if (!value) {
    return '<missing>';
  }
  if (value.length <= 8) {
    return '********';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
