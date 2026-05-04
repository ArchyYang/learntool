import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { Config } from '../core/types.js';
import { normaliseCliInput, normaliseMcpInput } from '../core/normalise.js';
import { judge } from '../core/judge.js';
import { write, query, boost, decay as runDecay } from '../core/store.js';
import { format, writeContextFile } from '../core/injector.js';

export async function startMcpServer(config: Config): Promise<void> {
  const server = new McpServer({
    name: 'learntool',
    version: '0.1.0',
  });

  // ── hooks_session_start ────────────────────────────────────────────────
  server.tool(
    'hooks_session_start',
    'Query the learning store for relevant patterns. Call at session start.',
    { prompt: z.string().optional() },
    async ({ prompt }) => {
      const patterns = await query(prompt ?? '', config.inject.maxPatterns, config);
      writeContextFile(patterns, config);
      const text = format(patterns, config);
      return { content: [{ type: 'text', text: text || 'No relevant patterns found.' }] };
    },
  );

  // ── hooks_post_edit ────────────────────────────────────────────────────
  server.tool(
    'hooks_post_edit',
    'Record the outcome of a file edit. Call after writing or editing a file.',
    {
      file: z.string().optional(),
      success: z.boolean().optional(),
      description: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    },
    async (params) => {
      const event = normaliseMcpInput('post-edit', params);
      const score = judge(event, config);
      if (score >= config.judge.gateThreshold) {
        const id = await write(event.summary, event.detail, event.category, 'mcp:hooks_post_edit', score, config);
        return { content: [{ type: 'text', text: `Recorded: ${id} (conf: ${score.toFixed(2)})` }] };
      }
      return { content: [{ type: 'text', text: `Discarded: confidence ${score.toFixed(2)} below gate` }] };
    },
  );

  // ── hooks_post_task ────────────────────────────────────────────────────
  server.tool(
    'hooks_post_task',
    'Record the outcome of a completed task, including structured learnings.',
    {
      description: z.string().optional(),
      success: z.boolean().optional(),
      learnings: z.array(z.object({
        summary: z.string(),
        confidence: z.number().min(0).max(1).optional(),
        detail: z.string().optional(),
      })).optional(),
    },
    async (params) => {
      const recorded: string[] = [];
      const source = 'mcp:hooks_post_task';

      if (params.learnings?.length) {
        for (const learning of params.learnings) {
          const event = normaliseMcpInput('post-task', { ...params, ...learning });
          const score = judge(event, config);
          if (score >= config.judge.gateThreshold) {
            const id = await write(event.summary, event.detail, event.category, source, score, config);
            recorded.push(id);
          }
        }
      } else if (params.description) {
        const event = normaliseMcpInput('post-task', params);
        const score = judge(event, config);
        if (score >= config.judge.gateThreshold) {
          const id = await write(event.summary, event.detail, event.category, source, score, config);
          recorded.push(id);
        }
      }

      return { content: [{ type: 'text', text: `Recorded ${recorded.length} patterns.` }] };
    },
  );

  // ── hooks_session_end ──────────────────────────────────────────────────
  server.tool(
    'hooks_session_end',
    'Run confidence decay and consolidate the store. Call at session end.',
    { outcome: z.enum(['success', 'failure', 'unknown']).optional() },
    async () => {
      const decayed = runDecay(config);
      return { content: [{ type: 'text', text: `Session ended. Decayed ${decayed} entries.` }] };
    },
  );

  // ── memory_store ───────────────────────────────────────────────────────
  server.tool(
    'memory_store',
    'Directly store a pattern. Equivalent to `learntool record`.',
    {
      summary: z.string(),
      category: z.string().optional(),
      detail: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    },
    async (params) => {
      const event = normaliseMcpInput('record', params);
      const score = judge(event, config);
      if (score >= config.judge.gateThreshold) {
        const id = await write(event.summary, event.detail, event.category, 'mcp:memory_store', score, config);
        return { content: [{ type: 'text', text: `Stored: ${id}` }] };
      }
      return { content: [{ type: 'text', text: `Discarded: confidence ${score.toFixed(2)} below gate` }] };
    },
  );

  // ── memory_search ──────────────────────────────────────────────────────
  server.tool(
    'memory_search',
    'Search for relevant patterns by semantic similarity.',
    { query: z.string(), limit: z.number().int().positive().optional() },
    async (params) => {
      const patterns = await query(params.query, params.limit ?? config.inject.maxPatterns, config);
      const text = format(patterns, config);
      return { content: [{ type: 'text', text: text || 'No matching patterns.' }] };
    },
  );

  // ── memory_boost ───────────────────────────────────────────────────────
  server.tool(
    'memory_boost',
    'Signal that a pattern was useful. Boosts its confidence score.',
    { id: z.string() },
    async ({ id }) => {
      boost(id, config);
      return { content: [{ type: 'text', text: `Boosted: ${id}` }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
