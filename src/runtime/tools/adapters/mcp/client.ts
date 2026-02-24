export type MCPClient = {
  connected: boolean;
};

export function createMCPClient(): MCPClient {
  return { connected: false };
}

