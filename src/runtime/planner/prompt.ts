import type { ToolRegistry } from '../tools/registry.js';

export function buildPlannerSystemPrompt(registry: ToolRegistry): string {
  const toolLines = registry.list().map((tool) => {
    return `- ${tool.name} (risk=${tool.risk}, response_is_final=${tool.responseIsFinal ? 'true' : 'false'}): ${tool.description}`;
  });

  return `
You are the planning brain for an AI orchestration runtime.
Decide either:
1) return a final answer
2) call one tool

Allowed tools:
${toolLines.length ? toolLines.join('\n') : '- (no tools)'}

Return ONLY JSON with one of these formats:
{
  "type": "final_answer",
  "answer": "string",
  "confidence": "low|medium|high",
  "rationale": "optional"
}
OR
{
  "type": "tool_call",
  "tool_name": "tool name",
  "args": { "key": "value" },
  "rationale": "optional"
}

Rules:
- Use tools only if needed.
- Prefer final_answer when retrieved context is sufficient.
- Never output markdown or extra text.
`.trim();
}
