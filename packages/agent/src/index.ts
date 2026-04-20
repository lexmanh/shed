/**
 * @lxmanh/shed-agent
 *
 * AI provider abstraction for Shed.
 * Supports Anthropic, OpenAI, Gemini, Groq, Mistral, OpenRouter, and Ollama (local).
 *
 * Privacy-first: every external API call is preceded by a user prompt
 * showing exactly what data will be sent.
 */

export * from './provider.js';
export * from './providers/anthropic.js';
export * from './providers/gemini.js';
export * from './providers/groq.js';
export * from './providers/mistral.js';
export * from './providers/ollama.js';
export * from './providers/openai.js';
export * from './providers/openrouter.js';
export * from './providers/openai-compatible.js';
export * from './tools.js';
export * from './tool-executor.js';
export * from './explain-session.js';
export * from './provider-factory.js';
