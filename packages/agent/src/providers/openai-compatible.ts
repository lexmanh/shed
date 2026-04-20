/**
 * Base provider for OpenAI-compatible APIs.
 * Used by OpenAI, Groq, Mistral, Ollama, OpenRouter — all share the same
 * chat completions API shape, differing only in baseURL and available models.
 */

import OpenAI from 'openai';
import type { AIMessage, AIProvider, AIResponse, AITool } from '../provider.js';

export interface OpenAICompatibleOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseURL?: string;
  readonly providerName: string;
  readonly isLocal?: boolean;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  readonly isLocal: boolean;

  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAICompatibleOptions) {
    this.name = options.providerName;
    this.isLocal = options.isLocal ?? false;
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });
  }

  async chat(args: {
    messages: readonly AIMessage[];
    tools?: readonly AITool[];
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<AIResponse> {
    const sdkMessages: OpenAI.ChatCompletionMessageParam[] = args.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const sdkTools: OpenAI.ChatCompletionTool[] | undefined = args.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        max_tokens: args.maxTokens ?? 1024,
        messages: sdkMessages,
        ...(sdkTools?.length ? { tools: sdkTools } : {}),
      },
      { signal: args.signal },
    );

    const choice = response.choices[0];
    const message = choice?.message;
    const text = message?.content ?? '';

    const toolCalls = (message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    const stopReason =
      choice?.finish_reason === 'tool_calls'
        ? 'tool_use'
        : choice?.finish_reason === 'length'
          ? 'max_tokens'
          : 'end';

    return {
      text,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
