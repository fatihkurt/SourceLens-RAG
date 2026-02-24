import { stableHash } from '../../shared/util/hash.js';
import type { MemoryStore } from './memory.js';
import type { MemoryItem } from './types.js';

export class InMemoryStore implements MemoryStore {
  private readonly bySession = new Map<string, MemoryItem[]>();

  async load(sessionId: string): Promise<MemoryItem[]> {
    return [...(this.bySession.get(sessionId) ?? [])];
  }

  async append(sessionId: string, item: MemoryItem): Promise<void> {
    const items = this.bySession.get(sessionId) ?? [];
    const resolvedItem = { ...item, id: item.id || stableHash(`${sessionId}:${item.createdAt}:${item.content}`) };
    items.push(resolvedItem);
    this.bySession.set(sessionId, items);
  }

  async clear(sessionId: string): Promise<void> {
    this.bySession.delete(sessionId);
  }
}

