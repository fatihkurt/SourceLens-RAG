import { z } from 'zod';
import type { ToolDefinition } from '../tool.js';

const EchoInput = z.object({
  text: z.string().min(1),
});

export const echoTool: ToolDefinition<{ text: string }, { echoed: string }> = {
  name: 'echo',
  description: 'Echoes text back for debugging tool orchestration.',
  risk: 'low',
  responseIsFinal: true,
  inputSchema: EchoInput,
  async execute(args) {
    const parsed = EchoInput.parse(args);
    return { echoed: parsed.text };
  },
};
