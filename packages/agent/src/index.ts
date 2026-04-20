/**
 * @lexmanh/shed-agent
 *
 * AI provider abstraction for Shed.
 * Supports Anthropic, OpenAI, and Ollama (local).
 *
 * Privacy-first: every external API call is preceded by a user prompt
 * showing exactly what data will be sent.
 */

export * from './provider.js';
export * from './providers/anthropic.js';
export * from './providers/ollama.js';
export * from './tools.js';
