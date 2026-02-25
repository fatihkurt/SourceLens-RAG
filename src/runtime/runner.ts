import type { ToolContext, ToolResult } from './tools/types.js';
import type { ToolRegistry } from './tools/registry.js';

type PlannerOutput =
  | { type: 'tool_call'; tool: string; args: unknown }
  | { type: 'final_answer'; text: string; confidence?: 'low' | 'medium' | 'high' };

type RunOnceResult = {
  answer: string;
  confidence: 'low' | 'medium' | 'high';
  sources: unknown[];
  meta: {
    toolCalls: number;
    retrievalCount: number;
    fastPath?: boolean;
  };
};

export async function runOnce(params: {
  registry: ToolRegistry;
  ctx: ToolContext;
  plannerDecide: (input: { userText: string; toolManifests: unknown }) => Promise<PlannerOutput>;
  userText: string;
  executeTool?: (toolName: string, args: unknown) => Promise<ToolResult>;
}): Promise<RunOnceResult> {
  const { registry, ctx, plannerDecide, userText } = params;

  const decision = await plannerDecide({
    userText,
    toolManifests: registry.listManifests(),
  });

  if (decision.type === 'final_answer') {
    return {
      answer: decision.text,
      confidence: decision.confidence ?? 'medium',
      sources: [],
      meta: { toolCalls: 0, retrievalCount: 0 },
    };
  }

  const toolDef = registry.get(decision.tool);
  if (!toolDef) {
    return {
      answer: `Unknown tool: ${decision.tool}`,
      confidence: 'low',
      sources: [],
      meta: { toolCalls: 1, retrievalCount: 0 },
    };
  }

  const toolResult = params.executeTool
    ? await params.executeTool(decision.tool, decision.args)
    : (await registry.execute(decision.tool, decision.args, ctx)).result;

  // FINAL FAST-PATH
  if (toolDef.manifest.responseIsFinal && toolResult.ok) {
    return {
      answer: toolResult.content,
      confidence: 'high',
      sources: [],
      meta: { toolCalls: 1, retrievalCount: 0, fastPath: true },
    };
  }

  return {
    answer: toolResult.ok
      ? toolResult.content
      : ('error' in toolResult ? toolResult.error : 'Tool execution failed'),
    confidence: toolResult.ok ? 'medium' : 'low',
    sources: [],
    meta: { toolCalls: 1, retrievalCount: 0, fastPath: false },
  };
}
