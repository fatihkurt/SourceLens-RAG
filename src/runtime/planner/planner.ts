import type { LLMClient } from '../../shared/llm/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import { buildPlannerSystemPrompt } from './prompt.js';
import { parsePlannerDecision } from './parse.js';
import type { PlannerDecision } from './types.js';

type DecideParams = {
  question: string;
  context: string;
  registry: ToolRegistry;
  temperature?: number;
};

export class Planner {
  constructor(private readonly llm: LLMClient) {}

  async decide(params: DecideParams): Promise<PlannerDecision> {
    const system = buildPlannerSystemPrompt(params.registry);
    const response = await this.llm.chat({
      temperature: params.temperature ?? 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: params.context || params.question },
      ],
    });

    try {
      return parsePlannerDecision(response.content);
    } catch {
      return {
        type: 'final_answer',
        answer: response.content || 'I could not produce a valid planner decision.',
        confidence: 'low',
        rationale: 'fallback_unparsed_planner_response',
      };
    }
  }
}

