/**
 * NOT production runtime. For tests/dev only.
 * Use `Agent.run(...)` for production orchestration flow.
 */
import type { ToolContext, ToolResult } from '../tools/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { PlannerDecision } from '../planner/types.js';
import { isFinalToolResponse, toolResultToAnswer } from '../tools/semantics.js';

type PlannerFinalizeOutput = { text: string; confidence?: 'low' | 'medium' | 'high' };

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
  plannerDecide: (input: { userText: string; toolManifests: unknown }) => Promise<PlannerDecision>;
  plannerFinalize?: (input: {
    userText: string;
    toolManifests: unknown;
    tool: { name: string; args: unknown; result: ToolResult };
  }) => Promise<PlannerFinalizeOutput>;
  userText: string;
  executeTool?: (toolName: string, args: unknown) => Promise<ToolResult>;
}): Promise<RunOnceResult> {
  const { registry, ctx, plannerDecide, userText } = params;
  const toolManifests = registry.listManifests();

  const decision = await plannerDecide({
    userText,
    toolManifests,
  });

  if (decision.type === 'final_answer') {
    return {
      answer: decision.answer,
      confidence: decision.confidence ?? 'medium',
      sources: [],
      meta: { toolCalls: 0, retrievalCount: 0 },
    };
  }

  const toolDef = registry.get(decision.tool_name);
  if (!toolDef) {
    return {
      answer: `Unknown tool: ${decision.tool_name}`,
      confidence: 'low',
      sources: [],
      meta: { toolCalls: 1, retrievalCount: 0 },
    };
  }

  const toolResult = params.executeTool
    ? await params.executeTool(decision.tool_name, decision.args)
    : (await registry.execute(decision.tool_name, decision.args, ctx)).result;

  if (isFinalToolResponse(toolDef.manifest, toolResult)) {
    return {
      answer: toolResultToAnswer(toolResult),
      confidence: 'high',
      sources: [],
      meta: { toolCalls: 1, retrievalCount: 0, fastPath: true },
    };
  }

  if (params.plannerFinalize) {
    const final = await params.plannerFinalize({
      userText,
      toolManifests,
      tool: { name: decision.tool_name, args: decision.args, result: toolResult },
    });

    return {
      answer: final.text,
      confidence: final.confidence ?? (toolResult.ok ? 'medium' : 'low'),
      sources: [],
      meta: { toolCalls: 1, retrievalCount: 0, fastPath: false },
    };
  }

  return {
    answer: toolResultToAnswer(toolResult),
    confidence: toolResult.ok ? 'medium' : 'low',
    sources: [],
    meta: { toolCalls: 1, retrievalCount: 0, fastPath: false },
  };
}
