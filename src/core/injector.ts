import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { Pattern, Config } from './types.js';

export function format(patterns: Pattern[], config: Config): string {
  if (patterns.length === 0) return '';

  if (config.inject.format === 'json') {
    return JSON.stringify(patterns, null, 2);
  }

  if (config.inject.format === 'plain') {
    return patterns
      .map((p) => `[${p.category}] ${p.summary}`)
      .join('\n');
  }

  // markdown (default)
  const lines = ['--- learntool: relevant patterns ---'];
  for (const p of patterns) {
    const meta = config.inject.showConfidence
      ? ` (conf: ${p.confidence.toFixed(2)} · used ${p.usageCount}×)`
      : '';
    lines.push(`• [${p.category}] ${p.summary}${meta}`);
    if (p.detail) lines.push(`  ${p.detail}`);
  }
  lines.push('---');
  return lines.join('\n');
}

export function writeContextFile(patterns: Pattern[], config: Config): void {
  const text = format(patterns, config);
  const path = config.inject.contextFile;

  if (!existsSync(dirname(path))) {
    mkdirSync(dirname(path), { recursive: true });
  }

  writeFileSync(path, text, 'utf-8');
}
