/**
 * ExplainSession — orchestrates a single AI analysis session.
 *
 * Flow:
 * 1. Build privacy preview (what data will be sent)
 * 2. Show preview and ask user consent (unless provider is local)
 * 3. Run agentic loop: AI calls tools → executor resolves → AI responds
 * 4. Return final explanation text
 *
 * Token budget: warn at 40k, hard stop at 100k (CLAUDE.md rule 8.4).
 */

import type { CleanableItem } from '@lxmanh/shed-core';
import type { AIMessage, AIProvider, PrivacyPreview } from './provider.js';
import { executeToolCall } from './tool-executor.js';
import { ALL_TOOLS } from './tools.js';

const TOKEN_WARN = 40_000;
const TOKEN_HARD_STOP = 100_000;

export interface ExplainSessionOptions {
  readonly provider: AIProvider;
  readonly scanRoot: string;
  readonly scannedItems?: readonly CleanableItem[];
  /** Called to show privacy preview and get user consent. Return false to abort. */
  readonly onPrivacyPrompt: (preview: PrivacyPreview) => Promise<boolean>;
  /** Called when token warning threshold is reached. */
  readonly onTokenWarning?: (used: number) => void;
  /** System prompt override. */
  readonly systemPrompt?: string;
}

export interface ExplainResult {
  readonly text: string;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly aborted: boolean;
}

const DEFAULT_SYSTEM = `You are Shed, an AI assistant helping developers reclaim disk space safely.
You have access to tools to scan projects and analyze disk usage. Use them to give accurate,
specific recommendations. Always explain WHY something is safe to delete and how to regenerate it.
Be concise. Format sizes in human-readable form (MB/GB). Never suggest deleting anything without
explaining the risk tier and how to recover.`;

export class ExplainSession {
  private readonly options: ExplainSessionOptions;

  constructor(options: ExplainSessionOptions) {
    this.options = options;
  }

  async run(userQuestion: string): Promise<ExplainResult> {
    const { provider, scanRoot, scannedItems, onPrivacyPrompt, onTokenWarning } = this.options;

    // Privacy gate for non-local providers
    if (!provider.isLocal) {
      const preview = buildPrivacyPreview(provider.name, scanRoot, scannedItems);
      const consented = await onPrivacyPrompt(preview);
      if (!consented) {
        return { text: '', totalInputTokens: 0, totalOutputTokens: 0, aborted: true };
      }
    }

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: this.options.systemPrompt ?? DEFAULT_SYSTEM,
      },
      { role: 'user', content: userQuestion },
    ];

    let totalInput = 0;
    let totalOutput = 0;

    // Agentic loop — max 10 iterations to prevent runaway
    for (let i = 0; i < 10; i++) {
      const response = await provider.chat({
        messages,
        tools: ALL_TOOLS,
        maxTokens: 2048,
      });

      totalInput += response.usage.inputTokens;
      totalOutput += response.usage.outputTokens;
      const totalUsed = totalInput + totalOutput;

      if (totalUsed >= TOKEN_HARD_STOP) {
        return {
          text: response.text || '[Session stopped: token budget exceeded]',
          totalInputTokens: totalInput,
          totalOutputTokens: totalOutput,
          aborted: true,
        };
      }

      if (totalUsed >= TOKEN_WARN) {
        onTokenWarning?.(totalUsed);
      }

      if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
        return {
          text: response.text,
          totalInputTokens: totalInput,
          totalOutputTokens: totalOutput,
          aborted: false,
        };
      }

      // Push assistant message with tool calls
      messages.push({ role: 'assistant', content: response.text || '[tool use]' });

      // Execute each tool call and push results
      for (const tc of response.toolCalls) {
        const result = await executeToolCall(tc.name, tc.input, scannedItems);
        messages.push({
          role: 'user',
          content: `Tool result for ${tc.name} (id: ${tc.id}):\n${JSON.stringify(result, null, 2)}`,
        });
      }
    }

    return {
      text: '[Session ended: max iterations reached]',
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      aborted: true,
    };
  }
}

function buildPrivacyPreview(
  providerName: string,
  scanRoot: string,
  items?: readonly CleanableItem[],
): PrivacyPreview {
  const itemCount = items?.length ?? 0;
  return {
    providerName,
    isLocal: false,
    dataIncluded: [
      `Scan root path: ${scanRoot}`,
      ...(itemCount > 0
        ? [`${itemCount} cleanable item paths (names only, no file contents)`]
        : []),
      'Project types detected (node, python, rust, etc.)',
      'Item sizes and risk tiers',
    ],
    dataExcluded: [
      'File contents',
      'Source code',
      'Environment variables',
      'API keys or secrets',
      'Git history',
    ],
    estimatedTokens: 500 + itemCount * 30,
  };
}
