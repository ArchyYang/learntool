import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Pattern, Config } from './types.js';
import { embed } from './embeddings.js';

let _db: DatabaseSync | null = null;

function resolvePath(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

function getDb(config: Config): DatabaseSync {
  if (_db) return _db;

  const path = resolvePath(config.store.path);
  mkdirSync(dirname(path), { recursive: true });

  _db = new DatabaseSync(path);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA synchronous = NORMAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS patterns (
      id          TEXT PRIMARY KEY,
      category    TEXT NOT NULL,
      summary     TEXT NOT NULL,
      detail      TEXT,
      source      TEXT NOT NULL,
      confidence  REAL NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      embedding   BLOB
    );
    CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence);
    CREATE INDEX IF NOT EXISTS idx_patterns_category   ON patterns(category);
    CREATE INDEX IF NOT EXISTS idx_patterns_updated    ON patterns(updated_at);
  `);

  return _db;
}

export async function write(
  summary: string,
  detail: string | undefined,
  category: string,
  source: string,
  confidence: number,
  config: Config,
): Promise<string> {
  const db = getDb(config);
  const id = randomUUID();
  const now = Date.now();
  const embeddingVec = await embed(summary, config.embeddings.mode, config.embeddings.dimension);

  db.prepare(`
    INSERT INTO patterns (id, category, summary, detail, source, confidence, usage_count, created_at, updated_at, embedding)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(id, category, summary, detail ?? null, source, confidence, now, now, Buffer.from(embeddingVec.buffer));

  return id;
}

export async function query(
  prompt: string,
  k: number,
  config: Config,
): Promise<Pattern[]> {
  const db = getDb(config);
  const queryVec = await embed(prompt, config.embeddings.mode, config.embeddings.dimension);
  const dimension = config.embeddings.dimension;

  // Fetch candidates, score by cosine similarity, return top-k
  const rows = db.prepare(`
    SELECT id, category, summary, detail, source, confidence, usage_count, created_at, updated_at, embedding
    FROM patterns
    WHERE confidence >= ?
    ORDER BY confidence DESC
    LIMIT 200
  `).all(config.store.minConfidence) as any[];

  const scored = rows.map((row) => {
    const blob = row.embedding as Uint8Array | Buffer | null;
    if (!blob) return { row, score: 0 };
    const rowVec = new Float32Array(
      blob instanceof Buffer ? blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength) : blob.buffer,
    );
    let dot = 0;
    for (let i = 0; i < dimension; i++) dot += queryVec[i] * rowVec[i];
    return { row, score: dot };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, k);

  // Boost usage_count for retrieved patterns
  const ids = top.map((t) => t.row.id);
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`
      UPDATE patterns
      SET usage_count = usage_count + 1,
          confidence  = MIN(?, confidence + ?),
          updated_at  = ?
      WHERE id IN (${placeholders})
    `).run(config.judge.maxConfidence, config.judge.accessBoost, Date.now(), ...ids);
  }

  return top.map(({ row }) => ({
    id: row.id,
    category: row.category,
    summary: row.summary,
    detail: row.detail ?? undefined,
    source: row.source,
    confidence: row.confidence,
    usageCount: row.usage_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function boost(id: string, config: Config): void {
  const db = getDb(config);
  db.prepare(`
    UPDATE patterns
    SET confidence  = MIN(?, confidence + ?),
        usage_count = usage_count + 1,
        updated_at  = ?
    WHERE id = ?
  `).run(config.judge.maxConfidence, config.judge.accessBoost, Date.now(), id);
}

export function decay(config: Config): number {
  const db = getDb(config);
  const now = Date.now();
  const MS_PER_HOUR = 3_600_000;

  const rows = db.prepare(`
    SELECT id, confidence, updated_at FROM patterns
  `).all() as { id: string; confidence: number; updated_at: number }[];

  let decayed = 0;

  const update = db.prepare(`
    UPDATE patterns SET confidence = ?, updated_at = ? WHERE id = ?
  `);

  const prune = db.prepare(`
    DELETE FROM patterns WHERE id = ? AND confidence <= ? AND usage_count = 0
  `);

  for (const row of rows) {
    const hoursSince = (now - row.updated_at) / MS_PER_HOUR;
    if (hoursSince < 1) continue;

    const newConf = Math.max(
      config.store.minConfidence,
      row.confidence - config.judge.decayRate * hoursSince,
    );

    if (newConf < row.confidence) {
      update.run(newConf, now, row.id);
      decayed++;
    }

    prune.run(row.id, config.store.minConfidence + 0.001);
  }

  // Trim to max entries, evict lowest-confidence first
  const count = (db.prepare('SELECT COUNT(*) as n FROM patterns').get() as any).n;
  if (count > config.store.maxEntries) {
    const toRemove = count - config.store.maxEntries;
    db.prepare(`
      DELETE FROM patterns WHERE id IN (
        SELECT id FROM patterns ORDER BY confidence ASC LIMIT ?
      )
    `).run(toRemove);
  }

  return decayed;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
