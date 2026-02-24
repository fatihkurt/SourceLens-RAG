import type { ToolCall } from '../tools/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { PolicyDecision, PolicyViolation } from './types.js';
import type { PolicyEngine } from './policy.js';

function deny(code: string, message: string): PolicyDecision {
  const violations: PolicyViolation[] = [{ code, message }];
  return { allowed: false, violations };
}

export class DefaultPolicyEngine implements PolicyEngine {
  checkToolCall(call: ToolCall, registry: ToolRegistry): PolicyDecision {
    const tool = registry.get(call.tool_name);
    if (!tool) {
      return deny('tool_not_found', `Tool is not registered: ${call.tool_name}`);
    }

    if (tool.manifest.risk === 'high') {
      return deny('tool_risk_high', `High-risk tool call blocked: ${call.tool_name}`);
    }

    return { allowed: true, violations: [] };
  }
}
