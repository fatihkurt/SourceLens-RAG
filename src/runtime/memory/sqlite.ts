import type { MemoryStore } from './memory.js';
import type { MemoryItem } from './types.js';

export class SQLiteMemoryStore implements MemoryStore {
  async load(_sessionId: string): Promise<MemoryItem[]> {
    throw new Error('SQLiteMemoryStore is not implemented yet.');
  }

  async append(_sessionId: string, _item: MemoryItem): Promise<void> {
    throw new Error('SQLiteMemoryStore is not implemented yet.');
  }

  async clear(_sessionId: string): Promise<void> {
    throw new Error('SQLiteMemoryStore is not implemented yet.');
  }
}

