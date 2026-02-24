import { retrieve } from '../../retrieval/retrieve.js';
import { stableHash } from '../../shared/util/hash.js';
import { ContextBuilder } from '../context/contextBuilder.js';
import type { MemoryStore } from '../memory/memory.js';
import type { PolicyEngine } from '../policies/policy.js';
import type { Planner } from '../planner/planner.js';
import type { Logger } from '../telemetry/logger.js';
import { TraceCollector } from '../telemetry/trace.js';
import type { ToolExecutionRecord, ToolResult } from '../tools/types.js';
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

function confidenceFromTools(toolCalls: ToolExecutionRecord[]): { confidence: 'low' | 'medium' | 'high'; reason: string } {
  if (!toolCalls.length) return { confidence: 'medium', reason: 'retrieval_or_planner' };
  return toolCalls.some((x) => x.result.ok)
    ? { confidence: 'high', reason: 'tool_ok' }
    : { confidence: 'medium', reason: 'tool_planner_fallback' };
}

function resultToAnswer(result: ToolResult): string {
  if (!result.ok) return 'error' in result ? result.error : 'Tool execution failed';
  return result.content;
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
    const toolResults: ToolExecutionRecord[] = [];
    let toolCalls = 0;

    for (let turn = 1; turn <= this.limits.maxTurns; turn++) {
      if (Date.now() - startMs > this.limits.timeoutMs) break;

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

        const toolConfidence = confidenceFromTools(toolResults);
        const confidence = decision.confidence ?? toolConfidence.confidence;
        const confidenceReason = toolConfidence.reason;
        const includeSources = toolResults.length === 0 && !toolIntent && retrieval.chunks.length > 0;

        return {
          answer: decision.answer,
          confidence,
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

      if (toolCalls >= this.limits.maxToolCalls) break;
      toolCalls += 1;

      const call = { tool_name: decision.tool_name, args: decision.args };
      const policy = this.deps.policies.checkToolCall(call, this.deps.tools);
      if (!policy.allowed) {
        const deniedResult: ToolResult = {
          ok: false,
          error: policy.violations.map((v) => v.message).join('; '),
          data: { tool: decision.tool_name },
        };
        turns.push({ turn, decision, toolResult: deniedResult });
        toolResults.push({ tool: decision.tool_name, result: deniedResult });
        continue;
      }

      const def = this.deps.tools.get(decision.tool_name);
      if (!def) {
        const missingResult: ToolResult = { ok: false, error: `Tool not found: ${decision.tool_name}` };
        turns.push({ turn, decision, toolResult: missingResult });
        toolResults.push({ tool: decision.tool_name, result: missingResult });
        continue;
      }

      const toolSpan = trace.start('tool.execute', { turn, tool: def.manifest.name });
      const execution = await this.deps.tools.execute(decision.tool_name, decision.args, { sessionId });
      trace.end(toolSpan, { ok: execution.result.ok });

      turns.push({ turn, decision, toolResult: execution.result });
      toolResults.push(execution);
      this.deps.logger.log('info', 'tool result', { tool: def.manifest.name, ok: execution.result.ok });

      if (def.manifest.responseIsFinal && execution.result.ok) {
        const answer = resultToAnswer(execution.result);
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

    const confidenceReason = 'limits_exceeded';
    return {
      answer: 'I could not complete the request within the orchestration limits.',
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
