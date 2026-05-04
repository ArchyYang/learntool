import type { Config } from '../core/types.js';
import { query } from '../core/store.js';

export async function getStatus(config: Config): Promise<void> {
  const patterns = await query('', 1000, config);
  const byCategory: Record<string, number> = {};
  for (const p of patterns) {
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
  }

  process.stdout.write(`\nlearntool status\n`);
  process.stdout.write(`  store:       ${config.store.path}\n`);
  process.stdout.write(`  total:       ${patterns.length} patterns\n`);
  process.stdout.write(`  gate:        confidence >= ${config.judge.gateThreshold}\n`);
  process.stdout.write(`  embeddings:  ${config.embeddings.mode} (dim ${config.embeddings.dimension})\n\n`);

  if (Object.keys(byCategory).length) {
    process.stdout.write(`  by category:\n`);
    for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      process.stdout.write(`    ${cat.padEnd(12)} ${count}\n`);
    }
  }
  process.stdout.write('\n');
}
