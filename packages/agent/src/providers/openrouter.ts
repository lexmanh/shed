import { OpenAICompatibleProvider } from './openai-compatible.js';

/**
 * OpenRouter — aggregates 200+ models behind a single API key.
 * Default model: google/gemini-2.5-pro (strong, cost-effective).
 * Users can set any model slug from openrouter.ai/models.
 */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model = 'google/gemini-2.5-pro') {
    super({
      apiKey,
      model,
      baseURL: 'https://openrouter.ai/api/v1',
      providerName: 'openrouter',
    });
  }
}
