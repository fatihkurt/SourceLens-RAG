import type { ToolDef } from '../registry.js';
import { manifest, handler } from '../../../tools/http_fetch.js';

export const httpFetchTool: ToolDef = { manifest, handler };

