import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Config } from '../core/types.js';
import { decay as runDecay } from '../core/store.js';

const PID_FILE = join(homedir(), '.learntool', 'daemon.pid');

export async function startDaemon(config: Config): Promise<void> {
  // Terminate any stale process from a previous run
  if (existsSync(PID_FILE)) {
    const oldPid = Number(readFileSync(PID_FILE, 'utf-8').trim());
    if (oldPid) {
      try { process.kill(oldPid, 0); process.kill(oldPid); } catch { /* already gone */ }
    }
  }

  writeFileSync(PID_FILE, String(process.pid), 'utf-8');
  process.stderr.write(`[learntool daemon] started (pid ${process.pid})\n`);

  const intervalMs = 30 * 60 * 1000; // 30 minutes

  async function tick(): Promise<void> {
    const decayed = runDecay(config);
    process.stderr.write(`[learntool daemon] decayed ${decayed} entries\n`);
  }

  await tick();
  setInterval(tick, intervalMs);

  process.on('SIGTERM', () => {
    try { require('fs').unlinkSync(PID_FILE); } catch {}
    process.exit(0);
  });
}
