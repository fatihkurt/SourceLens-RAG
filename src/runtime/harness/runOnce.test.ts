import test from 'node:test';
import assert from 'node:assert/strict';
import { runOnce } from './runOnce.js';
import { ToolRegistry } from '../tools/registry.js';
import { echoTool } from '../tools/builtins/echo.js';
import type { PlannerDecision } from '../planner/types.js';

test('runOnce returns planner final_answer directly', async () => {
  const registry = new ToolRegistry();
  registry.register(echoTool);

  const out = await runOnce({
    registry,
    ctx: { sessionId: 's1' },
    userText: 'hello',
    plannerDecide: async (): Promise<PlannerDecision> => ({
      type: 'final_answer',
      answer: 'direct',
      confidence: 'medium',
    }),
  });

  assert.equal(out.answer, 'direct');
  assert.equal(out.meta.toolCalls, 0);
  assert.equal(out.meta.fastPath, undefined);
});

test('runOnce uses fast-path when responseIsFinal tool succeeds', async () => {
  const registry = new ToolRegistry();
  registry.register(echoTool);

  const out = await runOnce({
    registry,
    ctx: { sessionId: 's2' },
    userText: 'use echo: hello',
    plannerDecide: async (): Promise<PlannerDecision> => ({
      type: 'tool_call',
      tool_name: 'echo',
      args: { text: 'hello' },
    }),
  });

  assert.equal(out.answer, 'hello');
  assert.equal(out.confidence, 'high');
  assert.equal(out.meta.fastPath, true);
});
