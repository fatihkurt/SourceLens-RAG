import fs from 'node:fs/promises';
import path from 'node:path';
import { createLLMClient } from '../shared/llm/client.js';
import { Agent } from '../runtime/agent/agent.js';
import { InMemoryStore } from '../runtime/memory/inMemory.js';
import { DefaultPolicyEngine } from '../runtime/policies/defaultPolicies.js';
import { Planner } from '../runtime/planner/planner.js';
import { ConsoleLogger } from '../runtime/telemetry/logger.js';
import { ToolRegistry } from '../runtime/tools/registry.js';
import { registerBuiltinTools } from '../runtime/tools/builtins/index.js';

type EvalCase = {
  id: string;
  question: string;
  expected_any_of?: string[];
};

function norm(p: string): string {
  return String(p ?? '').replace(/\\/g, '/').toLowerCase();
}

function hasExpected(sources: Array<{ source: string }>, expected: string[]): boolean {
  if (!expected.length) return true;
  const got = sources.map((s) => norm(s.source));
  return expected.some((needle) => got.some((g) => g.includes(norm(needle))));
}

export async function runAnswers(datasetPathArg?: string) {
  const datasetPath = datasetPathArg ?? path.join(process.cwd(), 'src', 'eval', 'datasets', 'cm.json');
  const raw = await fs.readFile(datasetPath, 'utf8');
  const cases = JSON.parse(raw) as EvalCase[];

  const registry = new ToolRegistry();
  registerBuiltinTools(registry);

  const agent = new Agent({
    planner: new Planner(createLLMClient()),
    tools: registry,
    memory: new InMemoryStore(),
    policies: new DefaultPolicyEngine(),
    logger: new ConsoleLogger(),
  });

  let pass = 0;
  const results = [];
  for (const tc of cases) {
    const out = await agent.run({ question: tc.question, sessionId: `eval:${tc.id}` });
    const expected = tc.expected_any_of ?? [];
    const ok = hasExpected(out.sources, expected);
    if (ok) pass++;

    results.push({
      id: tc.id,
      ok,
      question: tc.question,
      expected_any_of: expected,
      got: out.sources.map((s) => `${s.source}#${s.chunk_index}`),
      confidence: out.confidence,
      turns: out.turns.length,
      meta: out.meta,
    });
  }

  const summary = {
    pass,
    total: cases.length,
    hitRate: cases.length ? pass / cases.length : 0,
    results,
  };

  const outPath = path.join(process.cwd(), 'eval', 'last_answers_report.json');
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  runAnswers(process.argv[2]).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
