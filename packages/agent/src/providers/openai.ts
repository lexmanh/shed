import { OpenAICompatibleProvider } from './openai-compatible.js';

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model = 'gpt-4o') {
    super({ apiKey, model, providerName: 'openai' });
  }
}
