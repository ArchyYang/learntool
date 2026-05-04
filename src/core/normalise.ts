import type { NormalisedEvent, EventType } from './types.js';

/** Raw input shape coming from Claude Code's stdin JSON */
export interface CliStdinInput {
  session_id?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; description?: string; [k: string]: unknown };
  tool_success?: boolean;
  tool_exit_code?: number;
  cwd?: string;
  prompt?: string;
  // post-task fields
  task_description?: string;
  success?: boolean;
  learnings?: Array<{ summary: string; confidence?: number; detail?: string }>;
  outcome?: string;
  // manual record flags (merged in by CLI)
  category?: string;
  summary?: string;
  confidence?: number;
  detail?: string;
}

/** Raw params from an MCP tool call */
export interface McpToolInput {
  file?: string;
  success?: boolean;
  prompt?: string;
  description?: string;
  learnings?: Array<{ summary: string; confidence?: number; detail?: string }>;
  outcome?: string;
  key?: string;
  value?: string;
  namespace?: string;
  id?: string;
  category?: string;
  summary?: string;
  confidence?: number;
  detail?: string;
  [k: string]: unknown;
}

export function normaliseCliInput(
  type: EventType,
  raw: CliStdinInput,
): NormalisedEvent {
  const base: NormalisedEvent = {
    type,
    sessionId: raw.session_id,
    category: raw.category ?? inferCategory(type, raw),
    summary: raw.summary ?? inferSummary(type, raw),
    detail: raw.detail,
    callerConfidence: raw.confidence,
    prompt: raw.prompt,
  };

  if (type === 'post-edit') {
    return {
      ...base,
      filePath: raw.tool_input?.file_path as string | undefined,
      success: raw.tool_success,
    };
  }

  if (type === 'post-task') {
    return {
      ...base,
      success: raw.success,
      learnings: raw.learnings,
    };
  }

  if (type === 'session-end') {
    return {
      ...base,
      success: raw.outcome === 'success',
    };
  }

  return base;
}

export function normaliseMcpInput(
  type: EventType,
  raw: McpToolInput,
): NormalisedEvent {
  const base: NormalisedEvent = {
    type,
    category: raw.category ?? inferCategoryFromType(type),
    summary: raw.summary ?? raw.description ?? raw.key ?? '',
    detail: raw.detail ?? (raw.value !== raw.summary ? raw.value : undefined),
    callerConfidence: raw.confidence,
    prompt: raw.prompt,
  };

  if (type === 'post-edit') {
    return { ...base, filePath: raw.file, success: raw.success };
  }

  if (type === 'post-task') {
    return { ...base, success: raw.success, learnings: raw.learnings };
  }

  if (type === 'session-end') {
    return { ...base, success: raw.outcome === 'success' };
  }

  return base;
}

function inferCategory(type: EventType, raw: CliStdinInput): string {
  if (type === 'post-edit') return 'edit';
  if (type === 'post-task') return 'task';
  if (type === 'session-start' || type === 'session-end') return 'session';
  return 'general';
}

function inferCategoryFromType(type: EventType): string {
  const map: Record<EventType, string> = {
    'post-edit': 'edit',
    'post-task': 'task',
    'session-start': 'session',
    'session-end': 'session',
    'record': 'general',
  };
  return map[type];
}

function inferSummary(type: EventType, raw: CliStdinInput): string {
  if (type === 'post-edit' && raw.tool_input?.file_path) {
    const outcome = raw.tool_success ? 'succeeded' : 'failed';
    return `Edit to ${raw.tool_input.file_path} ${outcome}`;
  }
  if (type === 'post-task' && raw.task_description) {
    return raw.task_description;
  }
  return `${type} event`;
}
