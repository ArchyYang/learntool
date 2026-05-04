import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { z } from 'zod';
import { type Config, DEFAULT_CONFIG } from '../core/types.js';

const configSchema = z.object({
  store: z.object({
    path: z.string().optional(),
    maxEntries: z.number().int().positive().optional(),
    minConfidence: z.number().min(0).max(1).optional(),
  }).optional(),
  judge: z.object({
    gateThreshold: z.number().min(0).max(1).optional(),
    accessBoost: z.number().min(0).max(1).optional(),
    decayRate: z.number().min(0).optional(),
    maxConfidence: z.number().min(0).max(1).optional(),
    categoryBias: z.record(z.number()).optional(),
  }).optional(),
  inject: z.object({
    maxPatterns: z.number().int().positive().optional(),
    showConfidence: z.boolean().optional(),
    format: z.enum(['markdown', 'json', 'plain']).optional(),
    contextFile: z.string().optional(),
  }).optional(),
  embeddings: z.object({
    mode: z.enum(['hash', 'semantic']).optional(),
    dimension: z.number().int().positive().optional(),
  }).optional(),
  mcp: z.object({
    transport: z.enum(['stdio', 'tcp']).optional(),
    port: z.number().int().positive().optional(),
  }).optional(),
});

function resolvePath(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

/** Parse a minimal TOML-like config (key = value, [section] headers). */
function parseToml(raw: string): Record<string, unknown> {
  const result: Record<string, Record<string, unknown>> = {};
  let section = 'root';

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].replace(/\./g, '_');
      result[section] ??= {};
      continue;
    }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawVal] = kvMatch;
      let val: unknown = rawVal.trim();
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (!isNaN(Number(val))) val = Number(val);
      else val = String(val).replace(/^["']|["']$/g, '');

      (result[section] ??= {})[key] = val;
    }
  }

  return result;
}

let _cached: Config | null = null;

export function loadConfig(configPath?: string): Config {
  if (_cached) return _cached;

  const path = configPath ?? join(homedir(), '.learntool', 'config.toml');

  if (!existsSync(path)) {
    _cached = DEFAULT_CONFIG;
    return _cached;
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = parseToml(raw);
    const validated = configSchema.parse(parsed);

    _cached = {
      store: {
        ...DEFAULT_CONFIG.store,
        ...validated.store,
        path: resolvePath(validated.store?.path ?? DEFAULT_CONFIG.store.path),
      },
      judge: {
        ...DEFAULT_CONFIG.judge,
        ...validated.judge,
        categoryBias: {
          ...DEFAULT_CONFIG.judge.categoryBias,
          ...validated.judge?.categoryBias,
        },
      },
      inject: {
        ...DEFAULT_CONFIG.inject,
        ...validated.inject,
        contextFile: resolvePath(
          validated.inject?.contextFile ?? DEFAULT_CONFIG.inject.contextFile,
        ),
      },
      embeddings: { ...DEFAULT_CONFIG.embeddings, ...validated.embeddings },
      mcp: { ...DEFAULT_CONFIG.mcp, ...validated.mcp },
    };
  } catch {
    _cached = DEFAULT_CONFIG;
  }

  return _cached;
}

export function resetConfigCache(): void {
  _cached = null;
}
