import { createServer } from 'node:http';
import { createLLMClient } from '../../shared/llm/client.js';
import { Agent } from '../../runtime/agent/agent.js';
import { InMemoryStore } from '../../runtime/memory/inMemory.js';
import { DefaultPolicyEngine } from '../../runtime/policies/defaultPolicies.js';
import { Planner } from '../../runtime/planner/planner.js';
import { ConsoleLogger } from '../../runtime/telemetry/logger.js';
import { echoTool } from '../../runtime/tools/builtins/echo.js';
import { httpFetchTool } from '../../runtime/tools/builtins/http_fetch.js';
import { ToolRegistry } from '../../runtime/tools/registry.js';
import { handleRoute } from './routes.js';

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

const port = Number(process.env.PORT ?? 3000);
const server = createServer((req, res) => {
  handleRoute(req, res, agent).catch((e) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: String(e?.message ?? e) }));
  });
});

server.listen(port, () => {
  console.log(`[server] listening on :${port}`);
});

