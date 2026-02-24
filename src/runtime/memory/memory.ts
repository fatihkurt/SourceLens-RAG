import type { MemoryItem } from './types.js';

export interface MemoryStore {
  load(sessionId: string): Promise<MemoryItem[]>;
  append(sessionId: string, item: MemoryItem): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

