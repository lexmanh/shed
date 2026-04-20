import Anthropic from '@anthropic-ai/sdk';
import type { AIMessage, AIProvider, AIResponse, AITool } from '../provider.js';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly isLocal = false;

  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model = 'claude-opus-4-7') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(args: {
    messages: readonly AIMessage[];
    tools?: readonly AITool[];
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<AIResponse> {
    const sdkMessages = args.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const systemMsg = args.messages.find((m) => m.role === 'system')?.content;

    const sdkTools = args.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
    }));

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: args.maxTokens ?? 1024,
        ...(systemMsg ? { system: systemMsg } : {}),
        messages: sdkMessages,
        ...(sdkTools?.length ? { tools: sdkTools } : {}),
      },
      { signal: args.signal },
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

    const stopReason =
      response.stop_reason === 'tool_use'
        ? 'tool_use'
        : response.stop_reason === 'max_tokens'
          ? 'max_tokens'
          : 'end';

    return {
      text,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
