import type { ToolDef } from '../registry.js';
import { manifest, handler } from '../../../tools/echo.js';

export const echoTool: ToolDef = { manifest, handler };

