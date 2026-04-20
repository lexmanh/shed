/**
 * Ollama provider implementation (local LLM).
 * Privacy-friendly default for sensitive environments.
 * TODO: flesh out in Phase 4.
 */

import type { AIMessage, AIProvider, AIResponse, AITool } from '../provider.js';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly isLocal = true;

  constructor(
    private readonly model: string,
    private readonly endpoint = 'http://localhost:11434',
  ) {}

  async chat(_args: {
    messages: readonly AIMessage[];
    tools?: readonly AITool[];
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<AIResponse> {
    // TODO: POST to `${this.endpoint}/api/chat` with model + messages
    throw new Error('OllamaProvider.chat() not yet implemented (Phase 4)');
  }
}
