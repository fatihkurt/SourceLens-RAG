import { retrieve } from '../../retrieval/retrieve.js';
import { stableHash } from '../../shared/util/hash.js';
import { ContextBuilder } from '../context/contextBuilder.js';
import type { MemoryStore } from '../memory/memory.js';
import type { PolicyEngine } from '../policies/policy.js';
import type { Planner } from '../planner/planner.js';
import type { Logger } from '../telemetry/logger.js';
import { TraceCollector } from '../telemetry/trace.js';
import type { ToolResult } from '../tools/tool.js';
import type { ToolRegistry } from '../tools/registry.js';
import { defaultAgentLimits, type AgentLimits } from './limits.js';
import type { AgentRunInput, AgentRunResult, Turn } from './types.js';

const DEFAULT_SYSTEM_PROMPT = 'You are SourceLens Orchestrator. Use retrieved context and tools carefully.';

type AgentDeps = {
  planner: Planner;
  tools: ToolRegistry;
  memory: MemoryStore;
  policies: PolicyEngine;
  logger: Logger;
  limits?: Partial<AgentLimits>;
};

function detectToolIntent(userInput: string, toolNames: string[]): boolean {
  const q = String(userInput ?? '');
  const lower = q.toLowerCase();
  const mentionsTool = toolNames.some((t) => lower.includes(String(t ?? '').toLowerCase()));
  const asksToUseEn = /\b(use|call|run|invoke|tool)\b/i.test(q);
  const asksToUseTr = /\b(kullan|cagir|calistir|tool)\b/i.test(q);
  return mentionsTool && (asksToUseEn || asksToUseTr);
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (typeof result === 'number' || typeof result === 'boolean') return String(result);
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    if (typeof obj.answer === 'string') return obj.answer;
    if (typeof obj.echoed === 'string') return obj.echoed;
    if (typeof obj.result === 'string') return obj.result;

    if (obj.result && typeof obj.result === 'object') {
      const nested = obj.result as Record<string, unknown>;
      if (typeof nested.answer === 'string') return nested.answer;
      if (typeof nested.echoed === 'string') return nested.echoed;
    }

    try {
      return JSON.stringify(result);
    } catch {
      return 'Tool executed successfully.';
    }
  }

  return 'Tool executed successfully.';
}

export class Agent {
  private readonly contextBuilder = new ContextBuilder();
  private readonly limits: AgentLimits;

  constructor(private readonly deps: AgentDeps) {
    this.limits = { ...defaultAgentLimits, ...(deps.limits ?? {}) };
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const startMs = Date.now();
    const trace = new TraceCollector();
    const sessionId = input.sessionId ?? stableHash(`${Date.now()}:${input.question}`).slice(0, 12);

    const memoryLoadSpan = trace.start('memory.load');
    const memory = await this.deps.memory.load(sessionId);
    trace.end(memoryLoadSpan, { items: memory.length });

    const toolNames = this.deps.tools.list().map((t) => t.name);
    const toolIntent = detectToolIntent(input.question, toolNames);

    const retrievalSpan = trace.start('retrieval.retrieve');
    const retrieval = toolIntent
      ? { query: input.question, context: '', chunks: [] as any[] }
      : await retrieve(input.question, { topK: input.topK, topN: input.topN });
    trace.end(retrievalSpan, {
      chunks: retrieval.chunks.length,
      skipped: toolIntent,
      ...(toolIntent ? { reason: 'tool_intent' } : {}),
    });
    if (toolIntent) {
      this.deps.logger.log('info', 'retrieval skipped', { reason: 'tool_intent' });
    }

    const turns: Turn[] = [];
    const toolResults: ToolResult[] = [];
    let toolCalls = 0;

    for (let turn = 1; turn <= this.limits.maxTurns; turn++) {
      if (Date.now() - startMs > this.limits.timeoutMs) {
        break;
      }

      const buildSpan = trace.start('context.build', { turn });
      const context = this.contextBuilder.build({
        question: input.question,
        systemPrompt: input.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        memory,
        retrieved: retrieval.chunks,
        toolResults,
      });
      trace.end(buildSpan, { chars: context.full.length });

      const planSpan = trace.start('planner.decide', { turn });
      const decision = await this.deps.planner.decide({
        question: input.question,
        context: context.full,
        registry: this.deps.tools,
      });
      trace.end(planSpan, { type: decision.type });

      if (decision.type === 'final_answer') {
        turns.push({ turn, decision });

        await this.deps.memory.append(sessionId, {
          id: '',
          role: 'user',
          content: input.question,
          scope: 'session',
          createdAt: Date.now(),
        });
        await this.deps.memory.append(sessionId, {
          id: '',
          role: 'assistant',
          content: decision.answer,
          scope: 'session',
          createdAt: Date.now(),
        });

        const usedToolInThisRun = toolCalls > 0 || toolResults.length > 0;
        const includeSources = !usedToolInThisRun && !toolIntent && retrieval.chunks.length > 0;
        const inferredConfidence =
          decision.confidence ??
          (usedToolInThisRun ? (toolResults.some((r) => r.ok) ? 'high' : 'medium') : 'medium');
        const confidenceReason =
          usedToolInThisRun
            ? (toolResults.some((r) => r.ok) ? 'tool_ok' : 'tool_planner_fallback')
            : 'retrieval_or_planner';

        return {
          answer: decision.answer,
          confidence: inferredConfidence,
          confidence_reason: confidenceReason,
          turns,
          sources: includeSources
            ? retrieval.chunks.map((c) => ({
                source: c.source,
                chunk_index: c.chunk_index,
                ...(Number.isFinite(c.score) ? { score: c.score } : {}),
              }))
            : [],
          meta: {
            sessionId,
            toolCalls,
            retrievalCount: retrieval.chunks.length,
            retrievalSkipped: toolIntent,
            ...(toolIntent ? { retrievalReason: 'tool_intent' } : {}),
            confidence_reason: confidenceReason,
            durationMs: Date.now() - startMs,
            traces: trace.all(),
          },
        };
      }

      if (toolCalls >= this.limits.maxToolCalls) {
        break;
      }
      toolCalls += 1;

      const policy = this.deps.policies.checkToolCall(
        { tool_name: decision.tool_name, args: decision.args },
        this.deps.tools
      );
      if (!policy.allowed) {
        const deniedResult: ToolResult = {
          tool_name: decision.tool_name,
          ok: false,
          error: policy.violations.map((v) => v.message).join('; '),
        };
        turns.push({ turn, decision, toolResult: deniedResult });
        toolResults.push(deniedResult);
        continue;
      }

      const tool = this.deps.tools.get(decision.tool_name);
      if (!tool) {
        const missingResult: ToolResult = {
          tool_name: decision.tool_name,
          ok: false,
          error: `Tool not found: ${decision.tool_name}`,
        };
        turns.push({ turn, decision, toolResult: missingResult });
        toolResults.push(missingResult);
        continue;
      }

      const toolSpan = trace.start('tool.execute', { turn, tool: tool.name });
      let toolResult: ToolResult;
      try {
        const parsedArgs = tool.inputSchema.parse(decision.args);
        const result = await tool.execute(parsedArgs, { sessionId });
        toolResult = {
          tool_name: tool.name,
          ok: true,
          result,
        };
      } catch (error: any) {
        toolResult = {
          tool_name: tool.name,
          ok: false,
          error: String(error?.message ?? error),
        };
      }
      trace.end(toolSpan, { ok: toolResult.ok });

      turns.push({ turn, decision, toolResult });
      toolResults.push(toolResult);
      this.deps.logger.log('info', 'tool result', { tool: tool.name, ok: toolResult.ok });

      // Fast-path final: skip an extra planner turn for tools that are directly answerable.
      if (tool.responseIsFinal && toolResult.ok) {
        const answer = stringifyToolResult(toolResult.result);
        const confidenceReason = 'tool_ok';

        await this.deps.memory.append(sessionId, {
          id: '',
          role: 'user',
          content: input.question,
          scope: 'session',
          createdAt: Date.now(),
        });
        await this.deps.memory.append(sessionId, {
          id: '',
          role: 'assistant',
          content: answer,
          scope: 'session',
          createdAt: Date.now(),
        });

        return {
          answer,
          confidence: 'high',
          confidence_reason: confidenceReason,
          turns,
          sources: [],
          meta: {
            sessionId,
            toolCalls,
            retrievalCount: retrieval.chunks.length,
            retrievalSkipped: toolIntent,
            ...(toolIntent ? { retrievalReason: 'tool_intent' } : {}),
            confidence_reason: confidenceReason,
            durationMs: Date.now() - startMs,
            traces: trace.all(),
          },
        };
      }
    }

    const fallbackAnswer = 'I could not complete the request within the orchestration limits.';
    const confidenceReason = 'limits_exceeded';
    return {
      answer: fallbackAnswer,
      confidence: 'low',
      confidence_reason: confidenceReason,
      turns,
      sources: [],
      meta: {
        sessionId,
        toolCalls,
        retrievalCount: retrieval.chunks.length,
        retrievalSkipped: toolIntent,
        ...(toolIntent ? { retrievalReason: 'tool_intent' } : {}),
        confidence_reason: confidenceReason,
        durationMs: Date.now() - startMs,
        traces: trace.all(),
      },
    };
  }
}

