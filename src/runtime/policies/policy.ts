import type { ToolCall } from '../tools/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { PolicyDecision } from './types.js';

export interface PolicyEngine {
  checkToolCall(call: ToolCall, registry: ToolRegistry): PolicyDecision;
}
