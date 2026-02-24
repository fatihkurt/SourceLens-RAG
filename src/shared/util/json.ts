import { extractFirstJsonObject } from '../../utils/jsonExtractor.js';

export function strictParseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const extracted = extractFirstJsonObject(raw);
    if (!extracted) {
      throw new Error('No valid JSON object found');
    }
    return extracted as T;
  }
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

