import type { ToolCall } from '../tools/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { PolicyDecision, PolicyViolation } from './types.js';
import type { PolicyEngine } from './policy.js';

function deny(code: string, message: string): PolicyDecision {
  const violations: PolicyViolation[] = [{ code, message }];
  return { allowed: false, violations };
}

function readAllowlist(): string[] {
  return String(process.env.TOOL_ALLOWLIST ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export class DefaultPolicyEngine implements PolicyEngine {
  checkToolCall(call: ToolCall, registry: ToolRegistry): PolicyDecision {
    const tool = registry.get(call.tool_name);
    if (!tool) {
      return deny('tool_not_found', `Tool is not registered: ${call.tool_name}`);
    }

    const allowlist = readAllowlist();
    if (allowlist.length > 0 && !allowlist.includes(call.tool_name)) {
      return deny('tool_not_allowed', `Tool is not in allowlist: ${call.tool_name}. allowed=[${allowlist.join(', ')}]`);
    }

    if (tool.manifest.risk === 'high') {
      return deny('tool_risk_high', `High-risk tool call blocked: ${call.tool_name}`);
    }

    return { allowed: true, violations: [] };
  }
}
