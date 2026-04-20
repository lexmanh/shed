/**
 * Logger factory for @lxmanh/shed-core.
 *
 * Rules (CLAUDE.md §4):
 *   - core, agent, mcp-server MUST use this logger — never console.log.
 *   - cli MAY use console.log only for user-facing output.
 *
 * Level resolution order:
 *   1. LOG_LEVEL env var (explicit override)
 *   2. 'silent' when NODE_ENV=test (no noise in vitest output)
 *   3. 'debug' when DEBUG env var is set
 *   4. 'info' default
 */

import pino, { type Logger } from 'pino';

export type { Logger };

function resolveLevel(): string {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  if (process.env.NODE_ENV === 'test') return 'silent';
  if (process.env.DEBUG) return 'debug';
  return 'info';
}

/**
 * Root logger. All shed packages share this as their ancestor logger
 * so log routing / level changes apply uniformly.
 */
export const logger: Logger = pino({
  level: resolveLevel(),
  name: 'shed',
  // Remove pid/hostname — not useful for a CLI tool.
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a named child logger for a module.
 *
 * @example
 *   const log = createLogger('safety-checker');
 *   log.info({ path }, 'starting check');
 */
export function createLogger(name: string): Logger {
  return logger.child({ module: name });
}
