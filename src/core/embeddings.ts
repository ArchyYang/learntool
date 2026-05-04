/**
 * Deterministic hash embedding — no model, no deps.
 * Produces a float32 vector of the given dimension from an input string.
 *
 * Good enough for keyword-style recall. Swap for @xenova/transformers
 * when semantic mode is enabled.
 */
export function hashEmbed(text: string, dimension: number): Float32Array {
  const vec = new Float32Array(dimension);
  const lower = text.toLowerCase();

  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    const idx = (code * 31 + i) % dimension;
    vec[idx] += 1;
  }

  // L2 normalise
  let norm = 0;
  for (let i = 0; i < dimension; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dimension; i++) vec[i] /= norm;

  return vec;
}

export async function embed(
  text: string,
  mode: 'hash' | 'semantic',
  dimension: number,
): Promise<Float32Array> {
  if (mode === 'semantic') {
    try {
      // Lazy-load @xenova/transformers only if installed
      const { pipeline } = await import('@xenova/transformers' as string as any);
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      return new Float32Array(output.data);
    } catch {
      // Fall back to hash if package not installed
    }
  }
  return hashEmbed(text, dimension);
}
