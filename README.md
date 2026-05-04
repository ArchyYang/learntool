# learntool

> A self-learning memory layer for AI coding tools.

`learntool` observes your coding sessions — edits, tasks, outcomes — and builds a local pattern store that gets injected back into future AI sessions as context. The more you use it, the smarter your AI assistant gets about *your* codebase and habits.

It exposes **two integration surfaces** that share one core pipeline:
- **CLI hooks** — zero-config drop-in for Claude Code, Cursor, and Vim
- **MCP server** — structured tool interface for any MCP-compatible agent

---

## How it works

```
Session start  ──▶  query store  ──▶  write context.md  ──▶  AI reads it
     │
  [coding]
     │
Post-edit/task ──▶  judge(event)  ──▶  score ≥ gate?  ──▶  store pattern
     │
Session end    ──▶  decay low-confidence entries
```

1. **On session start** — relevant patterns are retrieved and written to `~/.learntool/context.md`, which your AI tool can read as memory.
2. **On each edit/task** — a confidence score is computed (outcome + category bias + duration) and high-signal patterns are stored in a local SQLite database.
3. **On session end** — stale or low-confidence entries decay, keeping the store focused.

---

## Installation

```bash
npm install -g learntool
```

**Requirements:** Node.js ≥ 22.5, `better-sqlite3` (optional peer dep — installed automatically on most platforms).

---

## Quick start

### Claude Code

```bash
learntool install --target claude
```

This writes the hook configuration into `.claude/settings.json` in your project. Optionally add the MCP server too:

```json
"mcpServers": {
  "learntool": { "command": "learntool", "args": ["mcp", "start"] }
}
```

### Cursor

```bash
learntool install --target cursor
```

### Vim / Neovim

```bash
learntool install --target vim
```

Prints the `autocmd` snippet to add to your `vimrc` / `init.vim`.

---

## CLI reference

```
learntool <subcommand> [options]

  session-start          Query store and write context.md       (SessionStart hook)
  post-edit              Record a file edit outcome              (PostToolUse hook)
  post-task              Record task completion with learnings   (SubagentStop hook)
  session-end            Run confidence decay & consolidate      (Stop hook)

  record                 Manually record a pattern
    --category <cat>       Category label (default: general)
    --summary  <text>      Short description (required)
    --detail   <text>      Long-form detail (optional)
    --confidence <0-1>     Override confidence score

  query  <prompt>        Query the store and print matching patterns
  status                 Show store statistics
  install --target <t>   Write hook config  (claude | cursor | vim)
  mcp start              Start the MCP server
  daemon start           Start background decay daemon
```

---

## MCP tools

When running as an MCP server (`learntool mcp start`), the following tools are available to any connected agent:

| Tool | Description |
|---|---|
| `hooks_session_start` | Query store for relevant patterns at session start |
| `hooks_post_edit` | Record the outcome of a file edit |
| `hooks_post_task` | Record task completion with structured learnings |
| `hooks_session_end` | Run decay and consolidate the store |
| `memory_store` | Directly store a pattern |
| `memory_search` | Search patterns by semantic similarity |
| `memory_boost` | Signal a pattern was useful (boosts its confidence) |

---

## Configuration

Create `~/.learntool/config.json` to override defaults:

```json
{
  "store": {
    "path": "~/.learntool/db.sqlite",
    "maxEntries": 5000,
    "minConfidence": 0.40
  },
  "judge": {
    "gateThreshold": 0.65,
    "accessBoost": 0.03,
    "decayRate": 0.005,
    "categoryBias": {
      "test": 0.10,
      "build": 0.05,
      "edit": 0.05
    }
  },
  "inject": {
    "maxPatterns": 5,
    "showConfidence": true,
    "format": "markdown",
    "contextFile": "~/.learntool/context.md"
  },
  "embeddings": {
    "mode": "hash"
  }
}
```

### Key settings

| Setting | Default | Description |
|---|---|---|
| `judge.gateThreshold` | `0.65` | Minimum confidence score to store a pattern |
| `judge.decayRate` | `0.005` | How fast unused patterns lose confidence per session |
| `judge.accessBoost` | `0.03` | Confidence bump when a pattern is retrieved and used |
| `inject.maxPatterns` | `5` | Max patterns injected into context per session |
| `inject.format` | `markdown` | Output format: `markdown`, `json`, or `plain` |
| `embeddings.mode` | `hash` | `hash` (fast, local) or `semantic` (higher quality) |

---

## Using as a library

```ts
import { judge, write, query, format } from 'learntool';
import { DEFAULT_CONFIG } from 'learntool';

const config = DEFAULT_CONFIG;

// Store a pattern
const score = judge({ type: 'record', category: 'test', summary: 'Always mock fs in unit tests', success: true }, config);
if (score >= config.judge.gateThreshold) {
  await write('Always mock fs in unit tests', undefined, 'test', 'manual', score, config);
}

// Retrieve patterns
const patterns = await query('writing tests with file system', 5, config);
console.log(format(patterns, config));
```

---

## License

MIT
