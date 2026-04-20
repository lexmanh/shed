/**
 * Anthropic provider implementation.
 * TODO: flesh out in Phase 4.
 */

import type { AIMessage, AIProvider, AIResponse, AITool } from '../provider.js';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly isLocal = false;

  constructor(
    private readonly apiKey: string,
    private readonly model = 'claude-opus-4-7',
  ) {}

  async chat(_args: {
    messages: readonly AIMessage[];
    tools?: readonly AITool[];
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<AIResponse> {
    // TODO: use @anthropic-ai/sdk
    // const client = new Anthropic({ apiKey: this.apiKey });
    // const response = await client.messages.create({ ... });
    throw new Error('AnthropicProvider.chat() not yet implemented (Phase 4)');
  }
}
