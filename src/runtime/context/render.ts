import { truncateText } from '../../shared/util/text.js';
import type { MemoryItem } from '../memory/types.js';
import type { ToolExecutionRecord } from '../tools/types.js';
import type { RetrievedChunk } from '../../retrieval/retrieve.js';

export function renderMemory(memory: MemoryItem[]): string {
  if (!memory.length) return '';
  return memory
    .slice(-8)
    .map((m) => `[${m.role}] ${truncateText(m.content, 200)}`)
    .join('\n');
}

export function renderTools(results: ToolExecutionRecord[]): string {
  if (!results.length) return '';
  return results
    .map((entry, i) => {
      const status = entry.result.ok ? 'ok' : 'error';
      const body = entry.result.ok
        ? entry.result.content
        : ('error' in entry.result ? entry.result.error : 'Tool execution failed');
      return `[#${i + 1}] tool=${entry.tool} status=${status}\n${truncateText(String(body ?? ''), 600)}`;
    })
    .join('\n\n');
}

export function renderRetrieval(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return '';
  return chunks
    .map((c, i) => {
      const section = c.section?.length ? ` section="${c.section.join(' > ')}"` : '';
      return `[#${i + 1}] source=${c.source} chunk=${c.chunk_index}${section}\n${c.text}`;
    })
    .join('\n\n');
}
