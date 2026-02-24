import { createLLMClient } from '../../shared/llm/client.js';
import { Agent } from '../../runtime/agent/agent.js';
import { InMemoryStore } from '../../runtime/memory/inMemory.js';
import { DefaultPolicyEngine } from '../../runtime/policies/defaultPolicies.js';
import { Planner } from '../../runtime/planner/planner.js';
import { ConsoleLogger } from '../../runtime/telemetry/logger.js';
import { ToolRegistry } from '../../runtime/tools/registry.js';
import { echoTool } from '../../runtime/tools/builtins/echo.js';
import { httpFetchTool } from '../../runtime/tools/builtins/http_fetch.js';

async function main() {
  const question = process.argv.slice(2).join(' ').trim();
  if (!question) {
    console.log('Usage: npm run cli:ts -- "<question>"');
    process.exit(1);
  }

  const registry = new ToolRegistry();
  registry.register(echoTool);
  if (process.env.ENABLE_HTTP_FETCH_TOOL === '1') {
    registry.register(httpFetchTool);
  }

  const agent = new Agent({
    planner: new Planner(createLLMClient()),
    tools: registry,
    memory: new InMemoryStore(),
    policies: new DefaultPolicyEngine(),
    logger: new ConsoleLogger(),
  });

  const out = await agent.run({ question });
  console.log('\nAnswer:\n', out.answer);
  console.log('\nConfidence:', out.confidence);
  console.log('\nSources:', out.sources);
  console.log('\nMeta:', JSON.stringify(out.meta, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

