import { OpenAICompatibleProvider } from './openai-compatible.js';

export class MistralProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model = 'mistral-large-latest') {
    super({
      apiKey,
      model,
      baseURL: 'https://api.mistral.ai/v1',
      providerName: 'mistral',
    });
  }
}
