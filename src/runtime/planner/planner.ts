import type { LLMClient } from '../../shared/llm/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import { buildPlannerSystemPrompt } from './prompt.js';
import { parsePlannerDecision } from './parse.js';
import { deterministicPreRoute } from './router.js';
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
    const routed = deterministicPreRoute({
      question: params.question,
      context: params.context,
      registry: params.registry,
    });
    if (routed) return routed;

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
      return parsePlannerDecision(response.content);
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

        return parsePlannerDecision(repair.content);
      } catch {
        return {
          type: 'final_answer',
          answer: 'I could not safely decide the next step. Please rephrase the request.',
          confidence: 'low',
          rationale: 'planner_parse_failed_all_passes',
        };
      }
    }
  }
}
