/**
 * AIProvider — unified interface for AI backends.
 *
 * Implementations: anthropic, openai, ollama.
 */

export interface AIMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

export interface AITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface AIToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface AIResponse {
  readonly text: string;
  readonly toolCalls: readonly AIToolCall[];
  readonly stopReason: 'end' | 'tool_use' | 'max_tokens';
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

export interface AIProvider {
  readonly name: string;
  readonly isLocal: boolean;

  /**
   * Send a conversation to the AI and get a response.
   * Supports function calling via tools parameter.
   */
  chat(args: {
    messages: readonly AIMessage[];
    tools?: readonly AITool[];
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<AIResponse>;
}

/**
 * Privacy preview — what will be sent to the AI provider.
 * Shown to the user BEFORE the request leaves the machine (unless provider is local).
 */
export interface PrivacyPreview {
  readonly providerName: string;
  readonly isLocal: boolean;
  readonly dataIncluded: readonly string[];
  readonly dataExcluded: readonly string[];
  readonly estimatedTokens: number;
}
