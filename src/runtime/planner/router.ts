import type { ToolRegistry } from '../tools/registry.js';
import type { ToolManifest } from '../tools/types.js';
import type { PlannerDecision } from './types.js';

type PreRouteParams = {
  question: string;
  context?: string;
  registry: ToolRegistry;
};

type ToolDirective = {
  toolName: string;
  payload: string;
  reason: string;
};

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasToolResultsInContext(context: string): boolean {
  return /\bTool Results:\s*\n/i.test(String(context ?? ''));
}

function tryParseJsonObject(input: string): Record<string, unknown> | null {
  const text = String(input ?? '').trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractKeyValueArgs(input: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const matches = String(input ?? '').match(/\b[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[^\s]+/g) ?? [];
  for (const entry of matches) {
    const idx = entry.indexOf('=');
    if (idx <= 0) continue;
    const key = entry.slice(0, idx).trim();
    const value = entry.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    out[key] = value;
  }
  return out;
}

function extractFirstUrl(input: string): string | null {
  const match = String(input ?? '').match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

function inferArgs(manifest: ToolManifest, payload: string, question: string): Record<string, unknown> {
  const parsed = tryParseJsonObject(payload);
  if (parsed) return parsed;

  const kv = extractKeyValueArgs(payload);
  if (Object.keys(kv).length > 0) return kv;

  const url = extractFirstUrl(payload || question);
  if (url && /fetch|http|url/i.test(manifest.name)) {
    return { url, method: 'GET' };
  }

  const trimmedPayload = String(payload ?? '').trim();
  if (trimmedPayload) {
    if (/echo|repeat|say/i.test(manifest.name)) return { text: trimmedPayload };
    return { input: trimmedPayload };
  }

  return {};
}

function hasRequiredArgs(args: Record<string, unknown>, schema?: Record<string, unknown>): boolean {
  if (!schema || schema.type !== 'object') return true;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  return required.every((key) => key in args);
}

function findDirective(question: string, tools: ToolManifest[]): ToolDirective | null {
  const text = String(question ?? '').trim();
  if (!text) return null;

  for (const tool of tools) {
    const escaped = escapeRegex(tool.name);

    const directPattern = new RegExp(`\\b${escaped}\\s*:\\s*([\\s\\S]+)$`, 'i');
    const directMatch = text.match(directPattern);
    if (directMatch?.[1]) {
      return { toolName: tool.name, payload: directMatch[1].trim(), reason: 'direct_payload' };
    }

    const verbPattern = new RegExp(
      `\\b(?:use|call|run|invoke|kullan|cagir|calistir)\\s+${escaped}\\b(?:\\s*[:\\-]\\s*([\\s\\S]+))?$`,
      'i'
    );
    const verbMatch = text.match(verbPattern);
    if (verbMatch) {
      return { toolName: tool.name, payload: (verbMatch[1] ?? '').trim(), reason: 'verb_invocation' };
    }

    const commandPattern = new RegExp(`^\\s*(?:please\\s+)?${escaped}\\s+([\\s\\S]+)$`, 'i');
    const commandMatch = text.match(commandPattern);
    if (commandMatch?.[1]) {
      return { toolName: tool.name, payload: commandMatch[1].trim(), reason: 'command_style' };
    }
  }

  return null;
}

export function deterministicPreRoute(params: PreRouteParams): PlannerDecision | null {
  if (hasToolResultsInContext(params.context ?? '')) {
    return null;
  }

  const manifests = params.registry.listManifests();
  const directive = findDirective(params.question, manifests);
  if (!directive) return null;

  const manifest = manifests.find((m) => m.name === directive.toolName);
  if (!manifest) return null;

  const args = inferArgs(manifest, directive.payload, params.question);
  if (!hasRequiredArgs(args, manifest.inputSchema)) {
    return null;
  }

  return {
    type: 'tool_call',
    tool_name: manifest.name,
    args,
    rationale: `deterministic_pre_router:${directive.reason}`,
  };
}
