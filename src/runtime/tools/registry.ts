import type { ToolContext, ToolExecutionRecord, ToolHandler, ToolManifest } from './types.js';

export type ToolDef = { manifest: ToolManifest; handler: ToolHandler };

function validateAgainstSchema(args: unknown, schema?: Record<string, unknown>): string | null {
  if (!schema) return null;
  const type = schema.type;
  if (type !== 'object') return null;

  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return 'args must be an object';
  }

  const argObj = args as Record<string, unknown>;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const key of required) {
    if (!(key in argObj)) return `missing required arg: ${key}`;
  }

  const properties = (schema.properties && typeof schema.properties === 'object')
    ? (schema.properties as Record<string, any>)
    : {};

  for (const [key, value] of Object.entries(argObj)) {
    const propSchema = properties[key];
    if (!propSchema) {
      if (schema.additionalProperties === false) {
        return `unexpected arg: ${key}`;
      }
      continue;
    }

    const expectedType = propSchema?.type;
    if (!expectedType) continue;

    if (expectedType === 'string' && typeof value !== 'string') return `arg ${key} must be string`;
    if (expectedType === 'number' && typeof value !== 'number') return `arg ${key} must be number`;
    if (expectedType === 'boolean' && typeof value !== 'boolean') return `arg ${key} must be boolean`;
    if (expectedType === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      return `arg ${key} must be object`;
    }
    if (expectedType === 'array' && !Array.isArray(value)) return `arg ${key} must be array`;
  }

  return null;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef>();

  register(def: ToolDef): void {
    const name = def?.manifest?.name;
    if (!name) {
      throw new Error('Tool manifest.name is required');
    }
    if (this.tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    this.tools.set(name, def);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  list(): ToolManifest[] {
    return [...this.tools.values()].map((t) => t.manifest);
  }

  describeForPrompt(): string {
    return this.list()
      .map((m) => {
        const risk = m.risk ?? 'low';
        const schema = m.inputSchema ? JSON.stringify(m.inputSchema) : '{}';
        return `- ${m.name}: ${m.description}\n  risk=${risk}\n  response_is_final=${m.responseIsFinal ? 'true' : 'false'}\n  args=${schema}`;
      })
      .join('\n');
  }

  async execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolExecutionRecord> {
    const def = this.get(name);
    if (!def) {
      return { tool: name, result: { ok: false, error: `Unknown tool: ${name}` } };
    }

    const validationError = validateAgainstSchema(args, def.manifest.inputSchema);
    if (validationError) {
      return {
        tool: name,
        result: {
          ok: false,
          error: `Invalid args for ${name}: ${validationError}`,
          data: { args },
        },
      };
    }

    try {
      const result = await def.handler(args, ctx);
      return { tool: name, result };
    } catch (error: any) {
      return {
        tool: name,
        result: { ok: false, error: String(error?.message ?? error) },
      };
    }
  }
}

