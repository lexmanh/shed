import { GoogleGenAI } from '@google/genai';
import type { AIMessage, AIProvider, AIResponse, AITool } from '../provider.js';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly isLocal = false;

  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model = 'gemini-2.5-pro') {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async chat(args: {
    messages: readonly AIMessage[];
    tools?: readonly AITool[];
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<AIResponse> {
    const systemMsg = args.messages.find((m) => m.role === 'system')?.content;
    const history = args.messages
      .filter((m) => m.role !== 'system')
      .slice(0, -1)
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const lastMsg = args.messages.filter((m) => m.role !== 'system').at(-1);

    const sdkTools = args.tools?.length
      ? [
          {
            functionDeclarations: args.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
            })),
          },
        ]
      : undefined;

    const chat = this.client.chats.create({
      model: this.model,
      ...(systemMsg ? { systemInstruction: systemMsg } : {}),
      history,
      config: {
        maxOutputTokens: args.maxTokens ?? 1024,
        ...(sdkTools ? { tools: sdkTools } : {}),
      },
    });

    const response = await chat.sendMessage({ message: lastMsg?.content ?? '' });

    const text = response.text ?? '';

    const toolCalls = (response.functionCalls ?? []).map((fc, i) => ({
      id: `gemini-tc-${i}`,
      name: fc.name ?? '',
      input: (fc.args ?? {}) as Record<string, unknown>,
    }));

    const stopReason =
      toolCalls.length > 0
        ? 'tool_use'
        : response.candidates?.[0]?.finishReason === 'MAX_TOKENS'
          ? 'max_tokens'
          : 'end';

    const usage = response.usageMetadata;

    return {
      text,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      },
    };
  }
}
