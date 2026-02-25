import type { ToolManifest, ToolResult } from './types.js';

export function isFinalToolResponse(manifest: ToolManifest, result: ToolResult): boolean {
  return Boolean(manifest.responseIsFinal && result.ok);
}

export function toolResultToAnswer(result: ToolResult): string {
  if (!result.ok) return 'error' in result ? result.error : 'Tool execution failed';
  return result.content;
}
