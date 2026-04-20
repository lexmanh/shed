/**
 * Factory to instantiate the correct AIProvider from shed config.
 * API keys are stored in the OS keychain via keytar.
 *
 * Supported providers: anthropic, openai, gemini, groq, mistral, openrouter, ollama
 */

import type { AIProvider } from './provider.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { GroqProvider } from './providers/groq.js';
import { MistralProvider } from './providers/mistral.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenAIProvider } from './providers/openai.js';
import { OpenRouterProvider } from './providers/openrouter.js';

export type ProviderName =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'groq'
  | 'mistral'
  | 'openrouter'
  | 'ollama';

export const PROVIDER_NAMES: ProviderName[] = [
  'anthropic',
  'openai',
  'gemini',
  'groq',
  'mistral',
  'openrouter',
  'ollama',
];

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: 'claude-opus-4-7',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
  groq: 'llama-3.3-70b-versatile',
  mistral: 'mistral-large-latest',
  openrouter: 'google/gemini-2.5-pro',
  ollama: 'llama3.2',
};

const KEYTAR_SERVICE = 'shed-ai';

export async function getStoredApiKey(provider: ProviderName): Promise<string | null> {
  try {
    const { default: keytar } = await import('keytar');
    return await keytar.getPassword(KEYTAR_SERVICE, provider);
  } catch {
    // keytar may not be available in all environments
    return process.env[`SHED_${provider.toUpperCase()}_API_KEY`] ?? null;
  }
}

export async function setStoredApiKey(provider: ProviderName, key: string): Promise<void> {
  try {
    const { default: keytar } = await import('keytar');
    await keytar.setPassword(KEYTAR_SERVICE, provider, key);
  } catch {
    throw new Error(
      `Could not store API key in keychain. Set SHED_${provider.toUpperCase()}_API_KEY env var instead.`,
    );
  }
}

export async function deleteStoredApiKey(provider: ProviderName): Promise<void> {
  try {
    const { default: keytar } = await import('keytar');
    await keytar.deletePassword(KEYTAR_SERVICE, provider);
  } catch {
    // ignore
  }
}

export interface CreateProviderOptions {
  readonly provider: ProviderName;
  readonly model?: string;
  /** For ollama: base URL override */
  readonly ollamaEndpoint?: string;
  /** API key override (skips keychain lookup) */
  readonly apiKey?: string;
}

export async function createProvider(options: CreateProviderOptions): Promise<AIProvider> {
  const { provider, model } = options;

  if (provider === 'ollama') {
    return new OllamaProvider(
      model ?? DEFAULT_MODELS.ollama,
      options.ollamaEndpoint,
    );
  }

  const apiKey =
    options.apiKey ??
    (await getStoredApiKey(provider)) ??
    process.env[`SHED_${provider.toUpperCase()}_API_KEY`];

  if (!apiKey) {
    throw new Error(
      `No API key found for provider "${provider}". ` +
        `Run: shed config set-key ${provider}\n` +
        `Or set env var: SHED_${provider.toUpperCase()}_API_KEY`,
    );
  }

  const m = model ?? DEFAULT_MODELS[provider];

  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, m);
    case 'openai':
      return new OpenAIProvider(apiKey, m);
    case 'gemini':
      return new GeminiProvider(apiKey, m);
    case 'groq':
      return new GroqProvider(apiKey, m);
    case 'mistral':
      return new MistralProvider(apiKey, m);
    case 'openrouter':
      return new OpenRouterProvider(apiKey, m);
  }
}
