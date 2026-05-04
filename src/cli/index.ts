#!/usr/bin/env node
import { loadConfig } from '../config/loader.js';
import { readStdin } from './stdin.js';
import { normaliseCliInput } from '../core/normalise.js';
import { judge } from '../core/judge.js';
import { write, query, decay as runDecay, closeDb } from '../core/store.js';
import { writeContextFile } from '../core/injector.js';
import type { CliStdinInput } from '../core/normalise.js';

const [,, subcommand, ...argv] = process.argv;

async function main(): Promise<void> {
  const config = loadConfig();

  switch (subcommand) {
    case 'session-start': {
      const raw = await readStdin() as CliStdinInput;
      const event = normaliseCliInput('session-start', raw);
      const patterns = await query(event.prompt ?? event.summary ?? '', config.inject.maxPatterns, config);
      writeContextFile(patterns, config);
      break;
    }

    case 'post-edit': {
      // Support both stdin JSON (Claude Code hooks) and --file/--success flags
      const raw = await readStdin() as CliStdinInput;
      const fileFlag = getFlag(argv, '--file');
      const successFlag = argv.includes('--success') ? argv[argv.indexOf('--success') + 1] !== 'false' : undefined;

      const merged: CliStdinInput = {
        ...raw,
        ...(fileFlag ? { tool_input: { file_path: fileFlag } } : {}),
        ...(successFlag !== undefined ? { tool_success: successFlag } : {}),
      };

      const event = normaliseCliInput('post-edit', merged);
      const score = judge(event, config);
      if (score >= config.judge.gateThreshold) {
        const source = 'cli:post-edit';
        await write(event.summary, event.detail, event.category, source, score, config);
      }
      break;
    }

    case 'post-task': {
      const raw = await readStdin() as CliStdinInput;
      if (!raw.success && !raw.learnings?.length) break;

      const source = 'cli:post-task';

      // Store each learning individually
      if (raw.learnings?.length) {
        for (const learning of raw.learnings) {
          const event = normaliseCliInput('post-task', {
            ...raw,
            summary: learning.summary,
            detail: learning.detail,
            confidence: learning.confidence,
          });
          const score = judge(event, config);
          if (score >= config.judge.gateThreshold) {
            await write(event.summary, event.detail, event.category, source, score, config);
          }
        }
      } else {
        const event = normaliseCliInput('post-task', raw);
        const score = judge(event, config);
        if (score >= config.judge.gateThreshold) {
          await write(event.summary, event.detail, event.category, source, score, config);
        }
      }
      break;
    }

    case 'session-end': {
      const raw = await readStdin() as CliStdinInput;
      void raw; // outcome recorded; decay runs
      const decayed = runDecay(config);
      process.stderr.write(`[learntool] session-end: decayed ${decayed} entries\n`);
      break;
    }

    case 'record': {
      const category = getFlag(argv, '--category') ?? 'general';
      const summary = getFlag(argv, '--summary');
      const confidence = getFlag(argv, '--confidence');
      const detail = getFlag(argv, '--detail');

      if (!summary) {
        process.stderr.write('learntool record: --summary is required\n');
        process.exit(1);
      }

      const event = normaliseCliInput('record', {
        category,
        summary,
        detail: detail ?? undefined,
        confidence: confidence ? Number(confidence) : undefined,
      });
      const score = judge(event, config);
      if (score >= config.judge.gateThreshold) {
        const id = await write(event.summary, event.detail, event.category, 'manual', score, config);
        process.stdout.write(`[learntool] recorded: ${id}\n`);
      } else {
        process.stderr.write(`[learntool] discarded: confidence ${score.toFixed(2)} below gate ${config.judge.gateThreshold}\n`);
      }
      break;
    }

    case 'query': {
      const prompt = argv.join(' ') || (await readStdin() as any).prompt;
      if (!prompt) { process.stderr.write('learntool query: provide a prompt\n'); process.exit(1); }
      const patterns = await query(prompt, config.inject.maxPatterns, config);
      const { format } = await import('../core/injector.js');
      process.stdout.write(format(patterns, config) + '\n');
      break;
    }

    case 'status': {
      const { getStatus } = await import('./status.js');
      await getStatus(config);
      break;
    }

    case 'install': {
      const { install } = await import('./install.js');
      await install(argv);
      break;
    }

    case 'mcp': {
      if (argv[0] === 'start') {
        const { startMcpServer } = await import('../mcp/server.js');
        await startMcpServer(config);
      }
      break;
    }

    case 'daemon': {
      if (argv[0] === 'start') {
        const { startDaemon } = await import('../daemon/index.js');
        await startDaemon(config);
      }
      break;
    }

    default:
      process.stdout.write(`learntool <subcommand> [options]

Subcommands:
  session-start          Query store and write context.md (call on SessionStart)
  post-edit              Record a file edit outcome      (call on PostToolUse)
  post-task              Record task completion          (call on SubagentStop)
  session-end            Run decay and consolidate       (call on Stop)
  record                 Manually record a pattern       (--category --summary --confidence)
  query  <prompt>        Query store and print patterns
  install --target <t>   Write hook config for target tool (claude|cursor|vim)
  mcp start              Start MCP server
  daemon start           Start background decay daemon
  status                 Show store statistics
`);
  }

  closeDb();
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

main().catch((err) => {
  process.stderr.write(`[learntool] error: ${err.message}\n`);
  process.exit(1);
});
