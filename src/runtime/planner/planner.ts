import type { LLMClient } from '../../shared/llm/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import { buildPlannerSystemPrompt } from './prompt.js';
import { parsePlannerDecision } from './parse.js';
import { deterministicPreRoute } from './router.js';
import type { PlannerDecision, PlannerObservation } from './types.js';

type DecideParams = {
  question: string;
  context: string;
  registry: ToolRegistry;
  temperature?: number;
};

export class Planner {
  private lastObservation: PlannerObservation | null = null;

  constructor(private readonly llm: LLMClient) {}

  getLastObservation(): PlannerObservation | null {
    if (!this.lastObservation) return null;
    return {
      ...this.lastObservation,
      usage: this.lastObservation.usage ? { ...this.lastObservation.usage } : undefined,
    };
  }

  async decide(params: DecideParams): Promise<PlannerDecision> {
    const startedAt = Date.now();
    const inputChars = String(params.context || params.question || '').length;

    const routed = deterministicPreRoute({
      question: params.question,
      context: params.context,
      registry: params.registry,
    });
    if (routed) {
      const decision: PlannerDecision = {
        ...routed,
        parse_mode: 'deterministic_router',
        planner_reason: routed.rationale ?? 'deterministic_pre_router',
      };
      this.lastObservation = {
        inputChars,
        outputType: decision.type,
        parseStatus: 'ok',
        parseMode: 'deterministic_router',
        latencyMs: Date.now() - startedAt,
        llmCalls: 0,
      };
      return decision;
    }

    const system = buildPlannerSystemPrompt(params.registry);
    const userContent = params.context || params.question;

    const response = await this.llm.chat({
      temperature: params.temperature ?? 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    });

    try {
      const parsed = parsePlannerDecision(response.content);
      const decision: PlannerDecision = {
        ...parsed,
        parse_mode: 'direct_parse',
        planner_reason: parsed.rationale ?? 'planner_direct_parse',
      };
      this.lastObservation = {
        inputChars,
        outputType: decision.type,
        parseStatus: 'ok',
        parseMode: 'direct_parse',
        latencyMs: Date.now() - startedAt,
        usage: response.usage,
        llmCalls: 1,
      };
      return decision;
    } catch {
      try {
        const repair = await this.llm.chat({
          temperature: 0,
          jsonMode: true,
          messages: [
            {
              role: 'system',
              content: `${system}

You are now in JSON repair mode.
Return ONLY one valid planner decision JSON object that matches the schema exactly.
Do not include markdown, comments, or extra text.`,
            },
            {
              role: 'user',
              content: `Fix this planner output into valid JSON:
${response.content}`,
            },
          ],
        });

        const repaired = parsePlannerDecision(repair.content);
        const mergedUsage = {
          prompt_tokens: Number(response.usage?.prompt_tokens ?? 0) + Number(repair.usage?.prompt_tokens ?? 0),
          completion_tokens:
            Number(response.usage?.completion_tokens ?? 0) + Number(repair.usage?.completion_tokens ?? 0),
          total_tokens: Number(response.usage?.total_tokens ?? 0) + Number(repair.usage?.total_tokens ?? 0),
        };

        const decision: PlannerDecision = {
          ...repaired,
          parse_mode: 'repair_parse',
          planner_reason: repaired.rationale ?? 'planner_repair_parse',
        };
        this.lastObservation = {
          inputChars,
          outputType: decision.type,
          parseStatus: 'repaired',
          parseMode: 'repair_parse',
          latencyMs: Date.now() - startedAt,
          usage: mergedUsage,
          llmCalls: 2,
        };
        return decision;
      } catch {
        const decision: PlannerDecision = {
          type: 'final_answer',
          answer: 'I could not safely decide the next step. Please rephrase the request.',
          confidence: 'low',
          rationale: 'planner_parse_failed_all_passes',
          planner_reason: 'planner_parse_failed_all_passes',
          parse_mode: 'fail_closed',
        };
        this.lastObservation = {
          inputChars,
          outputType: decision.type,
          parseStatus: 'failed',
          parseMode: 'fail_closed',
          latencyMs: Date.now() - startedAt,
          usage: response.usage,
          llmCalls: 2,
        };
        return decision;
      }
    }
  }
}
