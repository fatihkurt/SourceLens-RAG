import type { ToolRegistry } from '../registry.js';
import { echoTool } from './echo.js';
import { httpFetchTool } from './http_fetch.js';

export function registerBuiltinTools(registry: ToolRegistry): void {
  registry.register(echoTool);
  if (process.env.ENABLE_HTTP_FETCH_TOOL === '1') {
    registry.register(httpFetchTool);
  }
}

