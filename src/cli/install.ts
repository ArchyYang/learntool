import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const TARGETS: Record<string, () => Promise<void>> = {
  claude: installClaude,
  cursor: installCursor,
  vim: installVim,
};

export async function install(argv: string[]): Promise<void> {
  const idx = argv.indexOf('--target');
  const target = idx !== -1 ? argv[idx + 1] : undefined;

  if (!target || !TARGETS[target]) {
    process.stderr.write(`learntool install --target <tool>\nSupported: ${Object.keys(TARGETS).join(', ')}\n`);
    process.exit(1);
  }

  await TARGETS[target]();
}

async function installClaude(): Promise<void> {
  const path = join(process.cwd(), '.claude', 'settings.json');
  const hookBlock = buildHookBlock();
  mergeSettings(path, hookBlock);
  process.stdout.write(`[learntool] installed hooks into ${path}\n`);
  process.stdout.write(`[learntool] add to mcpServers in settings.json to also enable MCP:\n`);
  process.stdout.write(`  "mcpServers": { "learntool": { "command": "learntool", "args": ["mcp","start"] } }\n`);
}

async function installCursor(): Promise<void> {
  const path = join(process.cwd(), '.cursor', 'settings.json');
  const hookBlock = buildHookBlock();
  mergeSettings(path, hookBlock);
  process.stdout.write(`[learntool] installed hooks into ${path}\n`);
}

async function installVim(): Promise<void> {
  process.stdout.write(`[learntool] Add to your vimrc / init.vim:\n\n`);
  process.stdout.write(`autocmd BufWritePost * silent! !learntool post-edit --file <afile> --success true &\n\n`);
}

function buildHookBlock() {
  return {
    SessionStart: [
      { hooks: [{ type: 'command', command: 'learntool session-start' }] },
    ],
    PostToolUse: [
      {
        matcher: 'Write|Edit|MultiEdit',
        hooks: [{ type: 'command', command: 'learntool post-edit', timeout: 5000 }],
      },
    ],
    SubagentStop: [
      { hooks: [{ type: 'command', command: 'learntool post-task', timeout: 5000 }] },
    ],
    Stop: [
      { hooks: [{ type: 'command', command: 'learntool session-end', timeout: 10000 }] },
    ],
  };
}

function mergeSettings(path: string, hooks: object): void {
  mkdirSync(join(path, '..'), { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try { existing = JSON.parse(readFileSync(path, 'utf-8')); } catch {}
  }

  const merged = { ...existing, hooks: { ...(existing.hooks as object ?? {}), ...hooks } };
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}
