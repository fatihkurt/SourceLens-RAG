import { retrieve } from '../../retrieval/retrieve.js';
import { stableHash } from '../../shared/util/hash.js';
import { ContextBuilder } from '../context/contextBuilder.js';
import type { MemoryStore } from '../memory/memory.js';
import type { PolicyEngine } from '../policies/policy.js';
import type { Planner } from '../planner/planner.js';
import type { Logger } from '../telemetry/logger.js';
import { TraceCollector } from '../telemetry/trace.js';
import type { ToolErrorCode, ToolExecutionRecord, ToolResult } from '../tools/types.js';
import { isFinalToolResponse, toolResultToAnswer } from '../tools/semantics.js';
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

function readToolAllowlist(): string[] {
  return String(process.env.TOOL_ALLOWLIST ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolveAllowedTools(registry: ToolRegistry): string[] {
  const allowlist = readToolAllowlist();
  if (allowlist.length > 0) return allowlist;
  return registry.list().map((t) => t.name);
}

function firstToolErrorCode(violations: Array<{ code: string }>): ToolErrorCode {
  const code = violations[0]?.code;
  if (code === 'tool_not_allowed') return 'tool_not_allowed';
  if (code === 'tool_not_found') return 'tool_not_found';
  if (code === 'tool_risk_high') return 'tool_risk_high';
  return 'policy_blocked';
}

export class Agent {
  private readonly contextBuilder = new ContextBuilder();
  private readonly limits: AgentLimits;

  constructor(private readonly deps: AgentDeps) {
    this.limits = { ...defaultAgentLimits, ...(deps.limits ?? {}) };
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const question = String(input.question ?? input.userText ?? '').trim();
    if (!question) throw new Error('question is required');

    const startMs = Date.now();
    const trace = new TraceCollector();
    const sessionId = input.sessionId ?? stableHash(`${Date.now()}:${question}`).slice(0, 12);

    const memoryLoadSpan = trace.start('memory.load');
    const memory = await this.deps.memory.load(sessionId);
    trace.end(memoryLoadSpan, { items: memory.length });

    const toolNames = this.deps.tools.listManifests().map((t) => t.name);
    const toolIntent = detectToolIntent(question, toolNames);
    const retrievalMode = input.retrieval ?? 'auto';
    const retrievalSkipped = retrievalMode === 'never' || (retrievalMode === 'auto' && toolIntent);
    const retrievalReason = retrievalSkipped
      ? retrievalMode === 'never'
        ? 'retrieval_never'
        : 'tool_intent'
      : undefined;
    const maxTurns = Math.max(1, Math.min(Number(input.maxTurns ?? this.limits.maxTurns), this.limits.maxTurns));

    const retrievalSpan = trace.start('retrieval.retrieve');
    const retrieval = retrievalSkipped
      ? { query: question, context: '', chunks: [] as any[] }
      : await retrieve(question, { topK: input.topK, topN: input.topN });
    trace.end(retrievalSpan, {
      chunks: retrieval.chunks.length,
      skipped: retrievalSkipped,
      ...(retrievalReason ? { reason: retrievalReason } : {}),
    });
    if (retrievalSkipped) {
      this.deps.logger.log('info', 'retrieval skipped', { reason: retrievalReason });
    }

    const turns: Turn[] = [];
    const toolResults: ToolExecutionRecord[] = [];
    let toolCalls = 0;
    let lastPlannerReason: string | undefined;
    let lastParseMode: AgentRunResult['meta']['parse_mode'] | undefined;
    let lastPlannerObservation: AgentRunResult['meta']['planner_observation'] | undefined;

    for (let turn = 1; turn <= maxTurns; turn++) {
      if (Date.now() - startMs > this.limits.timeoutMs) break;

      const buildSpan = trace.start('context.build', { turn });
      const context = this.contextBuilder.build({
        question,
        systemPrompt: input.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        memory,
        retrieved: retrieval.chunks,
        toolResults,
      });
      trace.end(buildSpan, { chars: context.full.length });

      const planSpan = trace.start('planner.decide', { turn });
      const decision = await this.deps.planner.decide({
        question,
        context: context.full,
        registry: this.deps.tools,
      });
      const plannerObservation = this.deps.planner.getLastObservation() ?? undefined;
      const plannerReason = decision.planner_reason ?? decision.rationale;
      const parseMode = decision.parse_mode ?? plannerObservation?.parseMode;
      lastPlannerReason = plannerReason;
      lastParseMode = parseMode;
      lastPlannerObservation = plannerObservation;

      trace.end(planSpan, {
        type: decision.type,
        parse_mode: parseMode,
        parse_status: plannerObservation?.parseStatus,
        latency_ms: plannerObservation?.latencyMs,
        prompt_tokens: plannerObservation?.usage?.prompt_tokens,
        completion_tokens: plannerObservation?.usage?.completion_tokens,
        total_tokens: plannerObservation?.usage?.total_tokens,
      });

      this.deps.logger.log('info', 'planner observability', {
        turn,
        input_chars: plannerObservation?.inputChars ?? context.full.length,
        output_type: decision.type,
        parse_status: plannerObservation?.parseStatus ?? 'unknown',
        parse_mode: parseMode ?? 'unknown',
        latency_ms: plannerObservation?.latencyMs ?? null,
        usage: plannerObservation?.usage ?? null,
        llm_calls: plannerObservation?.llmCalls ?? null,
        planner_reason: plannerReason ?? null,
      });

      if (decision.type === 'final_answer') {
        turns.push({ turn, decision });

        await this.deps.memory.append(sessionId, {
          id: '',
          role: 'user',
          content: question,
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
        const includeSources = toolResults.length === 0 && !retrievalSkipped && retrieval.chunks.length > 0;

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
            retrievalSkipped,
            ...(retrievalReason ? { retrievalReason } : {}),
            confidence_reason: confidenceReason,
            planner_reason: plannerReason,
            parse_mode: parseMode,
            planner_observation: plannerObservation,
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
        const message = policy.violations.map((v) => v.message).join('; ');
        const deniedResult: ToolResult = {
          ok: false,
          error: message,
          data: { tool: decision.tool_name },
        };
        turns.push({ turn, decision, toolResult: deniedResult });
        toolResults.push({
          tool: decision.tool_name,
          result: deniedResult,
          feedback: {
            type: 'tool_error',
            code: firstToolErrorCode(policy.violations),
            tool: decision.tool_name,
            message,
            retryable: true,
            provided_args: decision.args,
            allowed_tools: resolveAllowedTools(this.deps.tools),
          },
        });
        continue;
      }

      const def = this.deps.tools.get(decision.tool_name);
      if (!def) {
        const message = `Tool not found: ${decision.tool_name}`;
        const missingResult: ToolResult = { ok: false, error: message };
        turns.push({ turn, decision, toolResult: missingResult });
        toolResults.push({
          tool: decision.tool_name,
          result: missingResult,
          feedback: {
            type: 'tool_error',
            code: 'tool_not_found',
            tool: decision.tool_name,
            message,
            retryable: true,
            provided_args: decision.args,
            allowed_tools: this.deps.tools.listManifests().map((t) => t.name),
          },
        });
        continue;
      }

      const toolSpan = trace.start('tool.execute', { turn, tool: def.manifest.name });
      const execution = await this.deps.tools.execute(decision.tool_name, decision.args, { sessionId });
      trace.end(toolSpan, { ok: execution.result.ok });

      turns.push({ turn, decision, toolResult: execution.result });
      toolResults.push(execution);
      this.deps.logger.log('info', 'tool result', { tool: def.manifest.name, ok: execution.result.ok });

      if (isFinalToolResponse(def.manifest, execution.result)) {
        const answer = toolResultToAnswer(execution.result);
        const confidenceReason = 'tool_ok';

        await this.deps.memory.append(sessionId, {
          id: '',
          role: 'user',
          content: question,
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
            retrievalSkipped,
            ...(retrievalReason ? { retrievalReason } : {}),
            confidence_reason: confidenceReason,
            planner_reason: lastPlannerReason,
            parse_mode: lastParseMode,
            planner_observation: lastPlannerObservation,
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
        retrievalSkipped,
        ...(retrievalReason ? { retrievalReason } : {}),
        confidence_reason: confidenceReason,
        planner_reason: lastPlannerReason,
        parse_mode: lastParseMode,
        planner_observation: lastPlannerObservation,
        durationMs: Date.now() - startMs,
        traces: trace.all(),
      },
    };
  }
}
