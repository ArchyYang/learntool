import type { NormalisedEvent } from './types.js';
import type { Config } from './types.js';

function clamp(v: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Pure function — no I/O, no LLM calls.
 * Converts a NormalisedEvent into a confidence score (0–1).
 *
 * If the caller set an explicit confidence, it wins outright.
 * Otherwise a heuristic is applied: outcome + category bias + duration penalty.
 */
export function judge(event: NormalisedEvent, config: Config): number {
  if (event.callerConfidence !== undefined) {
    return clamp(event.callerConfidence);
  }

  let score =
    event.success === true  ? 0.75 :
    event.success === false ? 0.40 :
                              0.55;

  score += config.judge.categoryBias[event.category] ?? 0;

  // Very fast edits are likely auto-format noise, not meaningful work
  if (event.durationMs !== undefined && event.durationMs < 200) {
    score -= 0.10;
  }

  return clamp(score, 0, config.judge.maxConfidence);
}
