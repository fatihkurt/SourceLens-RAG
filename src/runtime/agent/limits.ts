export type AgentLimits = {
  maxTurns: number;
  maxToolCalls: number;
  timeoutMs: number;
};

export const defaultAgentLimits: AgentLimits = {
  maxTurns: Number(process.env.AGENT_MAX_TURNS ?? 3),
  maxToolCalls: Number(process.env.AGENT_MAX_TOOL_CALLS ?? 2),
  timeoutMs: Number(process.env.AGENT_TIMEOUT_MS ?? 45000),
};

