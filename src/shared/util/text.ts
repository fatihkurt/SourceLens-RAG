export function normalizeText(input: string): string {
  return String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateText(input: string, maxChars = 400): string {
  const normalized = normalizeText(input);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

