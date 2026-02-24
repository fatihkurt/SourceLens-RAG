import type { ToolContext } from './tools/types.js';
import type { ToolRegistry } from './tools/registry.js';

type PlannerOutput =
  | { type: 'tool_call'; tool: string; args: unknown }
  | { type: 'final_answer'; text: string };

export async function runTurn(params: {
  registry: ToolRegistry;
  ctx: ToolContext;
  plannerDecide: (input: { userText: string; toolManifests: unknown }) => Promise<PlannerOutput>;
  userText: string;
}) {
  const { registry, ctx, plannerDecide, userText } = params;

  const decision = await plannerDecide({
    userText,
    toolManifests: registry.list(),
  });

  if (decision.type === 'final_answer') {
    return { answer: decision.text, sources: [], toolCalls: 0 };
  }

  const toolDef = registry.get(decision.tool);
  if (!toolDef) {
    return { answer: `Unknown tool: ${decision.tool}`, sources: [], toolCalls: 1 };
  }

  const execution = await registry.execute(decision.tool, decision.args, ctx);

  if (toolDef.manifest.responseIsFinal && execution.result.ok) {
    return { answer: execution.result.content, sources: [], toolCalls: 1 };
  }

  return {
    answer: execution.result.ok
      ? execution.result.content
      : ('error' in execution.result ? execution.result.error : 'Tool execution failed'),
    sources: [],
    toolCalls: 1,
  };
}
