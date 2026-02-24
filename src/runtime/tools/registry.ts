import type { ToolDefinition } from './tool.js';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<any, any>>();

  register(tool: ToolDefinition<any, any>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition<any, any>[] {
    return Array.from(this.tools.values());
  }

  describeForPrompt(): string {
    // minimal tool manifest for planner prompt
    return this.list()
      .map(
        (t) =>
          `- ${t.name}: ${t.description}\n  risk=${t.risk}\n  response_is_final=${t.responseIsFinal ? 'true' : 'false'}\n  args=${JSON.stringify(t.inputSchema.toJSONSchema(), null, 0)}`
      )
      .join('\n');
  }
}
