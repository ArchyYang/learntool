/**
 * Shared types for the learntool core pipeline.
 * Both CLI and MCP entry points produce NormalisedEvent before touching core.
 */

export type EventType =
  | 'post-edit'
  | 'post-task'
  | 'session-start'
  | 'session-end'
  | 'record';

export interface NormalisedEvent {
  type: EventType;
  sessionId?: string;
  category: string;
  summary: string;
  detail?: string;
  success?: boolean;
  filePath?: string;
  durationMs?: number;
  /** Set explicitly by caller — bypasses judge heuristic */
  callerConfidence?: number;
  /** Populated by post-task; each item may carry its own confidence */
  learnings?: Array<{ summary: string; confidence?: number; detail?: string }>;
  /** Used by session-start to seed the retrieval query */
  prompt?: string;
}

export interface Pattern {
  id: string;
  category: string;
  summary: string;
  detail?: string;
  source: string;
  confidence: number;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Config {
  store: {
    path: string;
    maxEntries: number;
    minConfidence: number;
  };
  judge: {
    gateThreshold: number;
    accessBoost: number;
    decayRate: number;
    maxConfidence: number;
    categoryBias: Record<string, number>;
  };
  inject: {
    maxPatterns: number;
    showConfidence: boolean;
    format: 'markdown' | 'json' | 'plain';
    contextFile: string;
  };
  embeddings: {
    mode: 'hash' | 'semantic';
    dimension: number;
  };
  mcp: {
    transport: 'stdio' | 'tcp';
    port: number;
  };
}

export const DEFAULT_CONFIG: Config = {
  store: {
    path: '~/.learntool/db.sqlite',
    maxEntries: 5000,
    minConfidence: 0.40,
  },
  judge: {
    gateThreshold: 0.65,
    accessBoost: 0.03,
    decayRate: 0.005,
    maxConfidence: 1.0,
    categoryBias: {
      test: 0.10,
      build: 0.05,
      edit: 0.05,
      git: 0.03,
      command: 0.00,
    },
  },
  inject: {
    maxPatterns: 5,
    showConfidence: true,
    format: 'markdown',
    contextFile: '~/.learntool/context.md',
  },
  embeddings: {
    mode: 'hash',
    dimension: 64,
  },
  mcp: {
    transport: 'stdio',
    port: 7379,
  },
};
