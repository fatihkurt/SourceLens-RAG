import { strictParseJson } from '../../shared/util/json.js';
import { PlannerDecisionSchema } from './schema.js';
import type { PlannerDecision } from './types.js';

export function parsePlannerDecision(raw: string): PlannerDecision {
  const parsed = strictParseJson<unknown>(raw);
  return PlannerDecisionSchema.parse(parsed);
}

