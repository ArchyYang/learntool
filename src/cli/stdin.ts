/**
 * JSON stdin reader with timeout.
 * Claude Code pipes hook event data as JSON via stdin.
 * Returns {} on TTY, timeout, or parse failure — never throws.
 */
export async function readStdin(timeoutMs = 3000): Promise<Record<string, unknown>> {
  if (process.stdin.isTTY) return {};

  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve({});
    }, timeoutMs);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => { data += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.trim()) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve({});
    });
    process.stdin.resume();
  });
}
