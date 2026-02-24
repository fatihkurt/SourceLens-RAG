import { truncateText } from '../../shared/util/text.js';
import type { MemoryItem } from '../memory/types.js';
import type { ToolResult } from '../tools/tool.js';
import type { RetrievedChunk } from '../../retrieval/retrieve.js';

export function renderMemory(memory: MemoryItem[]): string {
  if (!memory.length) return '';
  return memory
    .slice(-8)
    .map((m) => `[${m.role}] ${truncateText(m.content, 200)}`)
    .join('\n');
}

export function renderTools(results: ToolResult[]): string {
  if (!results.length) return '';
  return results
    .map((r, i) => {
      const status = r.ok ? 'ok' : 'error';
      const body = r.ok ? JSON.stringify(r.result) : r.error;
      return `[#${i + 1}] tool=${r.tool_name} status=${status}\n${truncateText(String(body ?? ''), 600)}`;
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

