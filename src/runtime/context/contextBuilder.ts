import { capChunksByCharBudget } from './budget.js';
import { mergeChunksBySource } from './merge.js';
import { renderMemory, renderRetrieval, renderTools } from './render.js';
import type { ContextBuildInput, RenderedContext } from './types.js';

const DEFAULT_MAX_CONTEXT_CHARS = Number(process.env.MAX_CONTEXT_CHARS ?? 3500);

export class ContextBuilder {
  build(input: ContextBuildInput): RenderedContext {
    const merged = mergeChunksBySource(input.retrieved);
    const budgeted = capChunksByCharBudget(merged, Number(input.maxChars ?? DEFAULT_MAX_CONTEXT_CHARS));

    const memory = renderMemory(input.memory);
    const retrieval = renderRetrieval(budgeted);
    const tools = renderTools(input.toolResults);

    const full = [
      `Question:\n${input.question}`,
      memory ? `Conversation Memory:\n${memory}` : '',
      retrieval ? `Retrieved Context:\n${retrieval}` : '',
      tools ? `Tool Results:\n${tools}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      system: input.systemPrompt,
      user: input.question,
      retrieval,
      tools,
      memory,
      full,
    };
  }
}

